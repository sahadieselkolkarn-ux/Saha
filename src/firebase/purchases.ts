'use client';

import {
  type Firestore,
  doc,
  runTransaction,
  collection,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { DocumentSettings, DocumentCounters, PurchaseDoc, UserProfile } from '@/lib/types';
import { sanitizeForFirestore } from '@/lib/utils';

/**
 * Creates a new purchase document with a transactionally-generated document number.
 * Includes an idempotency check if providedDocId is supplied.
 */
export async function createPurchaseDoc(
  db: Firestore,
  data: Omit<PurchaseDoc, 'id' | 'docNo' | 'status' | 'createdAt' | 'updatedAt'>,
  userProfile: UserProfile,
  initialStatus: PurchaseDoc['status'] = 'DRAFT',
  providedDocId?: string
): Promise<string> {
  const year = new Date(data.docDate).getFullYear();
  const counterRef = doc(db, 'documentCounters', String(year));
  const docSettingsRef = doc(db, 'settings', 'documents');
  
  // Use provided ID for idempotency or generate a new reference
  const newDocRef = providedDocId ? doc(db, 'purchaseDocs', providedDocId) : doc(collection(db, 'purchaseDocs'));

  const documentNumber = await runTransaction(db, async (transaction) => {
    // IDEMPOTENCY CHECK: If document already exists, just return its docNo
    if (providedDocId) {
      const existingDoc = await transaction.get(newDocRef);
      if (existingDoc.exists()) {
        return existingDoc.data().docNo as string;
      }
    }

    const counterDoc = await transaction.get(counterRef);
    const docSettingsDoc = await transaction.get(docSettingsRef);

    if (!docSettingsDoc.exists()) {
      throw new Error("Document settings not found. Please configure document prefixes first.");
    }
    
    const settingsData = docSettingsDoc.data() as DocumentSettings;
    const prefix = settingsData.purchasePrefix || 'PUR';

    let currentCounters: DocumentCounters = { year };
    if (counterDoc.exists()) {
      currentCounters = counterDoc.data() as DocumentCounters;
    }
    
    const newCount = (currentCounters.purchase || 0) + 1;
    const docNo = `${prefix}${year}-${String(newCount).padStart(4, '0')}`;
    
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
    transaction.set(counterRef, { ...currentCounters, purchase: newCount }, { merge: true });

    return docNo;
  });

  return documentNumber;
}
