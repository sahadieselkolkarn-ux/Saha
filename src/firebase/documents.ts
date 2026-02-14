'use client';

import {
  type Firestore,
  doc,
  runTransaction,
  collection,
  serverTimestamp,
  getDocs,
  query,
  where,
  setDoc,
  limit,
  orderBy,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import type { DocumentSettings, Document, DocType, JobStatus, UserProfile } from '@/lib/types';
import { sanitizeForFirestore } from '@/lib/utils';

/**
 * Normalizes year to Gregorian (CE).
 */
function normalizeYear(year: number): number {
  return year > 2400 ? year - 543 : year;
}

/**
 * Extracts sequence from strings like "DN2026-0012" -> 12
 */
function extractSequence(docNo: string): number {
  const parts = docNo.split('-');
  if (parts.length < 2) return 0;
  const num = parseInt(parts[parts.length - 1], 10);
  return isNaN(num) ? 0 : num;
}

export async function createDocument(
  db: Firestore,
  docType: DocType,
  data: Omit<Document, 'id' | 'docNo' | 'docType' | 'createdAt' | 'updatedAt' | 'status'>,
  userProfile: UserProfile,
  newJobStatus?: JobStatus,
  options?: { manualDocNo?: string; initialStatus?: string }
): Promise<{ docId: string; docNo: string }> {

  const newDocRef = doc(collection(db, 'documents'));
  const docId = newDocRef.id;

  let year = new Date().getFullYear();
  const dateInput = data.docDate || (data as any).issueDate;
  if (dateInput) {
    const dateObj = new Date(dateInput);
    if (!isNaN(dateObj.getTime())) {
      year = normalizeYear(dateObj.getFullYear());
    }
  }

  // 1. Manual Doc No Handling
  if (options?.manualDocNo) {
    const qDuplicate = query(collection(db, "documents"), where("docNo", "==", options.manualDocNo), where("docType", "==", docType), limit(1));
    const snapDuplicate = await getDocs(qDuplicate);
    if (!snapDuplicate.empty) {
      throw new Error(`เลขที่เอกสาร '${options.manualDocNo}' ถูกใช้ไปแล้วในระบบค่ะ`);
    }

    const docData = sanitizeForFirestore({
      ...data,
      docDate: dateInput || new Date().toISOString().split('T')[0],
      id: docId,
      docNo: options.manualDocNo,
      docType,
      status: options?.initialStatus ?? 'DRAFT',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    await setDoc(newDocRef, docData);
    if (data.jobId) {
      await updateDoc(doc(db, 'jobs', data.jobId), { 
        status: newJobStatus || 'WAITING_CUSTOMER_PICKUP', 
        salesDocId: docId, 
        salesDocNo: options.manualDocNo, 
        salesDocType: docType,
        lastActivityAt: serverTimestamp() 
      });
    }
    return { docId, docNo: options.manualDocNo };
  }

  // 2. Auto-Generated Number with Prefix Isolation
  const docSettingsSnap = await getDoc(doc(db, 'settings', 'documents'));
  if (!docSettingsSnap.exists()) throw new Error("กรุณาตั้งค่ารูปแบบเลขที่เอกสารก่อนค่ะ");
  
  const prefixes: Record<DocType, keyof DocumentSettings> = {
    QUOTATION: 'quotationPrefix',
    DELIVERY_NOTE: 'deliveryNotePrefix',
    TAX_INVOICE: 'taxInvoicePrefix',
    RECEIPT: 'receiptPrefix',
    BILLING_NOTE: 'billingNotePrefix',
    CREDIT_NOTE: 'creditNotePrefix',
    WITHHOLDING_TAX: 'withholdingTaxPrefix',
  };
  const prefix = (docSettingsSnap.data()[prefixes[docType]] || docType.substring(0, 2)).toUpperCase();

  // Baseline check: Find highest number actually existing in DB for THIS specific prefix and year
  const prefixSearch = `${prefix}${year}-`;
  const highestQ = query(
    collection(db, "documents"),
    where("docType", "==", docType),
    where("docNo", ">=", prefixSearch),
    where("docNo", "<=", prefixSearch + "\uf8ff"),
    orderBy("docNo", "desc"),
    limit(1)
  );
  const highestSnap = await getDocs(highestQ);
  let collectionMax = 0;
  if (!highestSnap.empty) {
    collectionMax = extractSequence(highestSnap.docs[0].data().docNo);
  }

  const result = await runTransaction(db, async (transaction) => {
    const counterRef = doc(db, 'documentCounters', String(year));
    const counterSnap = await transaction.get(counterRef);
    let counters = counterSnap.exists() ? counterSnap.data() : { year };

    // Prefix Change Detection:
    // We use a specific key for each Prefix to ensure they never share a counter.
    const countKey = `${docType}_${prefix}_count`;
    let lastCount = counters[countKey] || 0;
    
    // IMPORTANT: Start at 1 if this prefix is new or if collection search returned 0
    let nextCount = Math.max(lastCount, collectionMax) + 1;
    let finalDocNo = `${prefix}${year}-${String(nextCount).padStart(4, '0')}`;

    // Note: Collision check loop with getDocs is removed inside transaction as it is not supported.
    // Instead, we rely on the prefix-isolated count key and the baseline check.

    const docData = sanitizeForFirestore({
      ...data,
      docDate: dateInput || new Date().toISOString().split('T')[0],
      id: docId,
      docNo: finalDocNo,
      docType,
      status: options?.initialStatus ?? 'DRAFT',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    transaction.set(newDocRef, docData);
    transaction.set(counterRef, { 
        ...counters, 
        [countKey]: nextCount
    }, { merge: true });

    if (data.jobId) {
      transaction.update(doc(db, 'jobs', data.jobId), {
        status: newJobStatus || 'WAITING_CUSTOMER_PICKUP',
        salesDocId: docId,
        salesDocNo: finalDocNo,
        salesDocType: docType,
        lastActivityAt: serverTimestamp(),
      });
    }

    return { finalDocNo };
  });

  return { docId, docNo: result.finalDocNo };
}
