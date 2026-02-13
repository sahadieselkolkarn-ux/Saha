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
 * Normalizes year to Gregorian (CE). If year is Buddhist (BE > 2400), subtracts 543.
 */
function normalizeYear(year: number): number {
  return year > 2400 ? year - 543 : year;
}

/**
 * Extracts the sequence number from a document number string (e.g., "DN2026-0290" -> 290)
 */
function extractSequence(docNo: string): number {
  const parts = docNo.split('-');
  if (parts.length < 2) return 0;
  const num = parseInt(parts[parts.length - 1], 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Creates a new document in the 'documents' collection with a transactionally-generated document number.
 * Features: Year normalization, Collection-based baseline sync, and Collision prevention.
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

  // 1. Determine Target Year (Normalized to Gregorian)
  let year = new Date().getFullYear();
  const dateInput = data.docDate || (data as any).issueDate;
  if (dateInput) {
      const dateObj = new Date(dateInput);
      if (!isNaN(dateObj.getTime())) {
          year = normalizeYear(dateObj.getFullYear());
      }
  }

  // 2. Handling Manual Document Number
  if (options?.manualDocNo) {
    const duplicateQuery = query(
      collection(db, "documents"), 
      where("docNo", "==", options.manualDocNo), 
      where("docType", "==", docType),
      limit(1)
    );
    const querySnapshot = await getDocs(duplicateQuery);
    
    if (!querySnapshot.empty) {
      throw new Error(`เลขที่เอกสาร '${options.manualDocNo}' ถูกใช้ไปแล้วในระบบ กรุณาตรวจสอบอีกครั้งค่ะ`);
    }

    const newDocumentData: Document = {
        ...data,
        docDate: dateInput || new Date().toISOString().split('T')[0],
        id: docId,
        docNo: options.manualDocNo,
        docType,
        status: options?.initialStatus ?? 'DRAFT',
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
    };
    
    const sanitizedData = sanitizeForFirestore(newDocumentData);
    await setDoc(newDocRef, sanitizedData);

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
        });
        await batch.commit();
    }
    
    return { docId, docNo: options.manualDocNo };
  }

  // 3. Auto-Generated Number Logic
  const docSettingsRef = doc(db, 'settings', 'documents');
  const docSettingsSnap = await getDoc(docSettingsRef);
  if (!docSettingsSnap.exists()) {
      throw new Error("ยังไม่ได้ตั้งค่ารูปแบบเลขที่เอกสาร กรุณาตั้งค่าที่หน้า 'ตั้งค่าเลขที่เอกสาร' ก่อนค่ะ");
  }
  const settingsData = docSettingsSnap.data() as DocumentSettings;
  const prefixKey = docTypeToPrefixKey[docType];
  const prefix = (settingsData[prefixKey] || docType.substring(0, 2)).toUpperCase();

  // --- Baseline Sync: Find the actual highest number in the collection for this year/prefix ---
  // This prevents resetting to 0001 if the counter doc is out of sync.
  const prefixYearSearch = `${prefix}${year}-`;
  const highestQuery = query(
    collection(db, "documents"),
    where("docType", "==", docType),
    where("docNo", ">=", prefixYearSearch),
    where("docNo", "<=", prefixYearSearch + "\uf8ff"),
    orderBy("docNo", "desc"),
    limit(1)
  );
  const highestSnap = await getDocs(highestQuery);
  let collectionBaseline = 0;
  if (!highestSnap.empty) {
    collectionBaseline = extractSequence(highestSnap.docs[0].data().docNo);
  }

  // 4. Transactional Generation with Collision Check
  const result = await runTransaction(db, async (transaction) => {
    const counterRef = doc(db, 'documentCounters', String(year));
    const counterDoc = await transaction.get(counterRef);

    let currentCounters: any = { year };
    if (counterDoc.exists()) {
        currentCounters = counterDoc.data();
    }
    
    const specificCounterKey = `${docType}_${prefix}_count`;
    const counterValue = currentCounters[specificCounterKey] || 0;
    
    // Pick the higher one between Counter Doc and actual Collection Max
    let nextCount = Math.max(counterValue, collectionBaseline) + 1;
    let generatedDocNo = `${prefix}${year}-${String(nextCount).padStart(4, '0')}`;

    // Collision Check within transaction: ensures the number is truly unique
    // If DN2026-0007 exists, it will loop until it finds a free one
    let isUnique = false;
    while (!isUnique) {
      const collisionQuery = query(
        collection(db, "documents"), 
        where("docNo", "==", generatedDocNo), 
        where("docType", "==", docType),
        limit(1)
      );
      const collisionSnap = await getDocs(collisionQuery); // Note: getDocs in transaction is allowed in modern SDKs
      
      if (collisionSnap.empty) {
        isUnique = true;
      } else {
        nextCount++;
        generatedDocNo = `${prefix}${year}-${String(nextCount).padStart(4, '0')}`;
      }
    }

    const finalDocDate = dateInput || new Date().toISOString().split('T')[0];

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
        });
    }

    return { docNo: generatedDocNo };
  });

  return { docId, docNo: result.docNo };
}
