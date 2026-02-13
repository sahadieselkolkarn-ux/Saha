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
  limit,
  orderBy,
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
 * Prevents duplicates by checking existing numbers before finalizing.
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
    const duplicateQuery = query(collection(db, "documents"), where("docNo", "==", options.manualDocNo), where("docType", "==", docType));
    const querySnapshot = await getDocs(duplicateQuery);
    
    if (!querySnapshot.empty) {
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
            text: `สร้างเอกสาร ${docType} (บันทึกย้อนหลัง): ${options.manualDocNo}`,
            userName: userProfile.displayName,
            userId: userProfile.uid,
            createdAt: serverTimestamp(),
            photos: [],
        });
        await batch.commit();
    }
    
    return { docId, docNo: options.manualDocNo };

  } else {
    // 1. Determine the correct year from docDate or current date
    // Robust date parsing to avoid NaN issues
    let year = new Date().getFullYear();
    const dateInput = data.docDate || (data as any).issueDate;
    if (dateInput) {
        const dateObj = new Date(dateInput);
        if (!isNaN(dateObj.getTime())) {
            year = dateObj.getFullYear();
        }
    }
    
    const counterRef = doc(db, 'documentCounters', String(year));
    const docSettingsRef = doc(db, 'settings', 'documents');

    // 2. Transactional Number Generation
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
        
        // Counter key specific to the prefix to allow switching prefixes without duplication
        const specificCounterKey = `${docType}_${prefix}_count`;
        let lastCount = currentCounters[specificCounterKey];

        // Legacy fallback logic
        if (lastCount === undefined) {
            const legacyField = docTypeToCounterField[docType];
            if (currentCounters[`${legacyField}Prefix`] === prefix) {
                lastCount = currentCounters[legacyField] || 0;
            } else {
                lastCount = 0;
            }
        }

        let nextCount = (lastCount || 0) + 1;
        let generatedDocNo = `${prefix}${year}-${String(nextCount).padStart(4, '0')}`;
        
        // Important: docDate must be valid for the record
        const finalDocDate = dateInput && !isNaN(new Date(dateInput).getTime()) 
            ? dateInput 
            : new Date().toISOString().split('T')[0];

        const newDocumentData: Document = {
            ...data,
            docDate: finalDocDate,
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
            [specificCounterKey]: nextCount,
            [docTypeToCounterField[docType]]: nextCount,
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
    });

    return { docId, docNo: result.docNo };
  }
}
