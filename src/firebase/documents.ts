'use client';

import {
  type Firestore,
  doc,
  runTransaction,
  collection,
  serverTimestamp,
  Timestamp,
  getDocs,
  query,
  where,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import type { DocumentSettings, Document, DocType, DocumentCounters, JobStatus, UserProfile } from '@/lib/types';
import { sanitizeForFirestore } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const docTypeToCounterField: Record<DocType, keyof Omit<DocumentCounters, 'year'>> = {
    QUOTATION: 'quotation',
    DELIVERY_NOTE: 'deliveryNote',
    TAX_INVOICE: 'taxInvoice',
    RECEIPT: 'receipt',
    BILLING_NOTE: 'billingNote',
    CREDIT_NOTE: 'creditNote',
    WITHHOLDING_TAX: 'withholdingTax',
};

const docTypeToPrefixKey: Record<DocType, keyof DocumentSettings> = {
    QUOTATION: 'quotationPrefix',
    DELIVERY_NOTE: 'deliveryNotePrefix',
    TAX_INVOICE: 'taxInvoicePrefix',
    RECEIPT: 'receiptPrefix',
    BILLING_NOTE: 'billingNotePrefix',
    CREDIT_NOTE: 'creditNotePrefix',
    WITHHOLDING_TAX: 'withholdingTaxPrefix',
};

interface CreateDocumentOptions {
  manualDocNo?: string;
  initialStatus?: string; // default 'DRAFT'
}

/**
 * Creates a new document in the 'documents' collection with a transactionally-generated document number.
 * Prevents duplicates by storing counters per-prefix and implementing fallback logic.
 */
export async function createDocument(
  db: Firestore,
  docType: DocType,
  data: Omit<Document, 'id' | 'docNo' | 'docType' | 'createdAt' | 'updatedAt' | 'status'>,
  userProfile: UserProfile,
  newJobStatus?: JobStatus,
  options?: CreateDocumentOptions
): Promise<{ docId: string; docNo: string }> {

  const newDocRef = doc(collection(db, 'documents'));
  const docId = newDocRef.id;

  if (options?.manualDocNo) {
    const duplicateQuery = query(collection(db, "documents"), where("docNo", "==", options.manualDocNo));
    const querySnapshot = await getDocs(duplicateQuery);
    const isDuplicate = querySnapshot.docs.some(doc => doc.data().docType === docType);

    if (isDuplicate) {
      throw new Error(`เลขที่เอกสาร '${options.manualDocNo}' ถูกใช้ไปแล้วสำหรับเอกสารประเภทนี้`);
    }

    const newDocumentData: Document = {
        ...data,
        id: docId,
        docNo: options.manualDocNo,
        docType,
        status: options?.initialStatus ?? 'DRAFT',
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
    };
    
    const sanitizedData = sanitizeForFirestore(newDocumentData);
    await setDoc(newDocRef, sanitizedData)
      .catch(async (error) => {
        if (error.code === 'permission-denied') {
          const permissionError = new FirestorePermissionError({
            path: newDocRef.path,
            operation: 'create',
            requestResourceData: sanitizedData,
          } satisfies SecurityRuleContext);
          errorEmitter.emit('permission-error', permissionError);
        }
      });

    if (data.jobId) {
        const jobRef = doc(db, 'jobs', data.jobId);
        const batch = writeBatch(db);
        if (newJobStatus) {
            batch.update(jobRef, { status: newJobStatus, lastActivityAt: serverTimestamp() });
        }
        const activityRef = doc(collection(db, 'jobs', data.jobId, 'activities'));
        batch.set(activityRef, {
            text: `สร้างเอกสาร ${docType} (Backfill): ${options.manualDocNo}`,
            userName: userProfile.displayName,
            userId: userProfile.uid,
            createdAt: serverTimestamp(),
            photos: [],
        });
        await batch.commit().catch(async (error) => {
          if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
              path: jobRef.path,
              operation: 'update',
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
          }
        });
    }
    
    return { docId, docNo: options.manualDocNo };

  } else {
    // Robust year calculation
    const dateObj = data.docDate ? new Date(data.docDate) : new Date();
    const year = isNaN(dateObj.getTime()) ? new Date().getFullYear() : dateObj.getFullYear();
    
    const counterRef = doc(db, 'documentCounters', String(year));
    const docSettingsRef = doc(db, 'settings', 'documents');

    const result = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const docSettingsDoc = await transaction.get(docSettingsRef);

        if (!docSettingsDoc.exists()) {
            throw new Error("ยังไม่ได้ตั้งค่ารูปแบบเลขที่เอกสาร กรุณาตั้งค่าที่หน้า 'ตั้งค่าเลขที่เอกสาร' ก่อนค่ะ");
        }
        
        const settingsData = docSettingsDoc.data() as DocumentSettings;
        const prefixKey = docTypeToPrefixKey[docType];
        const prefix = (settingsData[prefixKey] || docType.substring(0, 2)).toUpperCase();

        let currentCounters: any = { year };
        if (counterDoc.exists()) {
            currentCounters = counterDoc.data();
        }
        
        // --- SMART COUNTER LOGIC ---
        // 1. Check if we have a counter for this specific prefix
        const specificCounterKey = `${docType}_${prefix}_count`;
        let lastCount = currentCounters[specificCounterKey];

        // 2. If no specific counter, check legacy counter for backward compatibility
        if (lastCount === undefined) {
            const legacyField = docTypeToCounterField[docType];
            const legacyPrefixField = `${legacyField}Prefix`;
            
            // Only adopt legacy counter if the prefix matches
            if (currentCounters[legacyPrefixField] === prefix) {
                lastCount = currentCounters[legacyField] || 0;
            } else {
                lastCount = 0;
            }
        }

        const newCount = (lastCount || 0) + 1;
        const generatedDocNo = `${prefix}${year}-${String(newCount).padStart(4, '0')}`;
        
        const newDocumentData: Document = {
            ...data,
            docDate: data.docDate || dateObj.toISOString().split('T')[0], // Ensure docDate is set
            id: docId,
            docNo: generatedDocNo,
            docType,
            status: options?.initialStatus ?? 'DRAFT',
            createdAt: serverTimestamp() as Timestamp,
            updatedAt: serverTimestamp() as Timestamp,
        };
        
        const sanitizedData = sanitizeForFirestore(newDocumentData);

        transaction.set(newDocRef, sanitizedData);
        transaction.set(counterRef, { 
            ...currentCounters, 
            [specificCounterKey]: newCount,
            // Keep legacy fields updated for sync
            [docTypeToCounterField[docType]]: newCount,
            [`${docTypeToCounterField[docType]}Prefix`]: prefix 
        }, { merge: true });

        if (data.jobId) {
            const jobRef = doc(db, 'jobs', data.jobId);
            if (newJobStatus) {
                transaction.update(jobRef, { status: newJobStatus, lastActivityAt: serverTimestamp() });
            }
            const activityRef = doc(collection(db, 'jobs', data.jobId, 'activities'));
            transaction.set(activityRef, {
                text: `สร้างเอกสาร ${docType}: ${generatedDocNo}`,
                userName: userProfile.displayName,
                userId: userProfile.uid,
                createdAt: serverTimestamp(),
                photos: [],
            });
        }

        return { docNo: generatedDocNo };
    }).catch(async (error) => {
      if (error.code === 'permission-denied') {
        const permissionError = new FirestorePermissionError({
          path: 'documents/' + docId,
          operation: 'create',
          requestResourceData: data,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      }
      throw error;
    });

    return { docId, docNo: result.docNo };
  }
}
