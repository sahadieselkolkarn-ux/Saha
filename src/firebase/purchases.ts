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
 * Creates a new purchase document with a transactionally-generated document number.
 * Implements counter reset protection, year normalization, and collision prevention.
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

  // Get current settings
  const docSettingsRef = doc(db, 'settings', 'documents');
  const docSettingsDoc = await getDoc(docSettingsRef);
  if (!docSettingsDoc.exists()) {
    throw new Error("ยังไม่ได้ตั้งค่ารูปแบบเลขที่เอกสารจัดซื้อ");
  }
  const prefix = (docSettingsDoc.data() as DocumentSettings).purchasePrefix || 'PUR';

  // Collection baseline sync
  const prefixYearSearch = `${prefix}${year}-`;
  const highestQuery = query(
    collection(db, "purchaseDocs"),
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

  const documentNumber = await runTransaction(db, async (transaction) => {
    if (providedDocId) {
      const existingDoc = await transaction.get(newDocRef);
      if (existingDoc.exists()) {
        return existingDoc.data().docNo as string;
      }
    }

    const counterRef = doc(db, 'documentCounters', String(year));
    const counterDoc = await transaction.get(counterRef);

    let currentCounters: any = { year };
    if (counterDoc.exists()) {
      currentCounters = counterDoc.data();
    }
    
    const counterKey = `PURCHASE_${prefix}_count`;
    const counterValue = currentCounters[counterKey] || 0;
    
    let nextCount = Math.max(counterValue, collectionBaseline) + 1;
    let docNo = `${prefix}${year}-${String(nextCount).padStart(4, '0')}`;

    // Internal collision check
    let isUnique = false;
    while (!isUnique) {
      const collisionQuery = query(collection(db, "purchaseDocs"), where("docNo", "==", docNo), limit(1));
      const collisionSnap = await getDocs(collisionQuery);
      if (collisionSnap.empty) {
        isUnique = true;
      } else {
        nextCount++;
        docNo = `${prefix}${year}-${String(nextCount).padStart(4, '0')}`;
      }
    }

    const newDocumentData: PurchaseDoc = {
      ...data,
      id: newDocRef.id,
      docNo,
      status: initialStatus,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      ...(initialStatus === 'PENDING_REVIEW' && { submittedAt: serverTimestamp() as Timestamp })
    };
    
    const sanitizedData = sanitizeForFirestore(newDocumentData);
    transaction.set(newDocRef, sanitizedData);
    transaction.set(counterRef, { 
        ...currentCounters, 
        purchase: nextCount,
        purchasePrefix: prefix,
        [counterKey]: nextCount
    }, { merge: true });

    return docNo;
  });

  return documentNumber;
}
