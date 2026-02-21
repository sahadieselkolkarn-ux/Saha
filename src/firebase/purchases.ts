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
  limit,
  orderBy,
  getDoc
} from 'firebase/firestore';
import type { DocumentSettings, PurchaseDoc, UserProfile } from '@/lib/types';
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
 * Uses a robust transaction pattern on documentCounters.
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

  // Get current document settings for the prefix
  const docSettingsSnap = await getDoc(doc(db, 'settings', 'documents'));
  const prefix = (docSettingsSnap.exists() ? (docSettingsSnap.data() as DocumentSettings).purchasePrefix : 'PUR') || 'PUR';

  // 1. Pre-transaction: Find the highest existing number for this prefix in the current year.
  // This provides a starting baseline to avoid reuse of numbers if counters were reset.
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

  // 2. Transaction: Calculate next number and write the document.
  const documentNumber = await runTransaction(db, async (transaction) => {
    // If we're retrying/re-submitting, check if the doc already exists to avoid duplicate numbers
    if (providedDocId) {
      const existingDoc = await transaction.get(newDocRef);
      if (existingDoc.exists()) return existingDoc.data().docNo as string;
    }

    const counterRef = doc(db, 'documentCounters', String(year));
    const counterDoc = await transaction.get(counterRef);
    let counters = counterDoc.exists() ? counterDoc.data() : { year };
    
    // Prefix-specific counter key
    const countKey = `PURCHASE_${prefix.toUpperCase()}_count`;
    const lastCount = counters[countKey] || 0;
    
    const nextCount = Math.max(lastCount, collectionBaseline) + 1;
    const docNo = `${prefix}${year}-${String(nextCount).padStart(4, '0')}`;

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
    transaction.set(counterRef, { 
        ...counters, 
        [countKey]: nextCount
    }, { merge: true });

    return docNo;
  });

  return documentNumber;
}
