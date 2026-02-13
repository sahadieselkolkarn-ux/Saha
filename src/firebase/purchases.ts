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
  limit,
  orderBy,
  getDoc
} from 'firebase/firestore';
import type { DocumentSettings, DocumentCounters, PurchaseDoc, UserProfile } from '@/lib/types';
import { sanitizeForFirestore } from '@/lib/utils';

function normalizeYear(year: number): number {
  return year > 2400 ? year - 543 : year;
}

function extractSequence(docNo: string): number {
  const parts = docNo.split('-');
  if (parts.length < 2) return 0;
  const num = parseInt(parts[parts.length - 1], 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Creates a new purchase document with prefix isolation and collision prevention.
 */
export async function createPurchaseDoc(
  db: Firestore,
  data: Omit<PurchaseDoc, 'id' | 'docNo' | 'status' | 'createdAt' | 'updatedAt'>,
  userProfile: UserProfile,
  initialStatus: PurchaseDoc['status'] = 'DRAFT',
  providedDocId?: string
): Promise<string> {
  const dateObj = new Date(data.docDate);
  const year = normalizeYear(dateObj.getFullYear());
  
  const newDocRef = providedDocId ? doc(db, 'purchaseDocs', providedDocId) : doc(collection(db, 'purchaseDocs'));

  const docSettingsSnap = await getDoc(doc(db, 'settings', 'documents'));
  if (!docSettingsSnap.exists()) throw new Error("ยังไม่ได้ตั้งค่ารูปแบบเลขที่เอกสารจัดซื้อ");
  const prefix = (docSettingsSnap.data() as DocumentSettings).purchasePrefix || 'PUR';

  // Collection baseline sync for this specific prefix
  const prefixSearch = `${prefix}${year}-`;
  const highestQ = query(
    collection(db, "purchaseDocs"),
    where("docNo", ">=", prefixSearch),
    where("docNo", "<=", prefixSearch + "\uf8ff"),
    orderBy("docNo", "desc"),
    limit(1)
  );
  const highestSnap = await getDocs(highestQ);
  let collectionBaseline = 0;
  if (!highestSnap.empty) {
    collectionBaseline = extractSequence(highestSnap.docs[0].data().docNo);
  }

  const documentNumber = await runTransaction(db, async (transaction) => {
    if (providedDocId) {
      const existingDoc = await transaction.get(newDocRef);
      if (existingDoc.exists()) return existingDoc.data().docNo as string;
    }

    const counterRef = doc(db, 'documentCounters', String(year));
    const counterDoc = await transaction.get(counterRef);
    let counters = counterDoc.exists() ? counterDoc.data() : { year };
    
    const specificKey = `PURCHASE_${prefix}_count`;
    const lastCount = counters[specificKey] || 0;
    
    let nextCount = Math.max(lastCount, collectionBaseline) + 1;
    let docNo = `${prefix}${year}-${String(nextCount).padStart(4, '0')}`;

    // Collision check loop
    let isUsed = true;
    while (isUsed) {
      const collCheck = query(collection(db, "purchaseDocs"), where("docNo", "==", docNo), limit(1));
      const collSnap = await getDocs(collCheck);
      if (collSnap.empty) {
        isUsed = false;
      } else {
        nextCount++;
        docNo = `${prefix}${year}-${String(nextCount).padStart(4, '0')}`;
      }
    }

    const docData = sanitizeForFirestore({
      ...data,
      id: newDocRef.id,
      docNo,
      status: initialStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(initialStatus === 'PENDING_REVIEW' && { submittedAt: serverTimestamp() })
    });

    transaction.set(newDocRef, docData);
    transaction.set(counterRef, { ...counters, [specificKey]: nextCount }, { merge: true });

    return docNo;
  });

  return documentNumber;
}
