

'use client';

import {
  type Firestore,
  doc,
  collection,
  serverTimestamp,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  limit,
  setDoc,
} from 'firebase/firestore';
import type { Document, UserProfile, PaymentClaim } from '@/lib/types';
import { sanitizeForFirestore } from '@/lib/utils';

interface ClaimOptions {
  suggestedPaymentMethod?: 'CASH' | 'TRANSFER' | 'CREDIT';
  suggestedAccountId?: string;
  note?: string;
}

/**
 * Ensures a payment claim exists for a given sales document.
 * If a pending claim for the document already exists, it does nothing.
 * Otherwise, it creates a new pending payment claim.
 *
 * @param db The Firestore instance.
 * @param documentId The ID of the source document (e.g., DELIVERY_NOTE, TAX_INVOICE).
 * @param userProfile The profile of the user who initiated the action.
 * @param options Optional parameters for the claim.
 * @returns A promise that resolves to an object with a `created` boolean.
 * @throws Will throw an error if the document is not found or if there's a Firestore issue.
 */
export async function ensurePaymentClaimForDocument(
  db: Firestore,
  documentId: string,
  userProfile?: UserProfile | null,
  options?: ClaimOptions
): Promise<{ created: boolean, claimId: string | null }> {
  
  const docRef = doc(db, 'documents', documentId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error(`Document with ID ${documentId} not found.`);
  }

  const document = {id: docSnap.id, ...docSnap.data()} as Document;

  if (!['DELIVERY_NOTE', 'TAX_INVOICE'].includes(document.docType) || document.status === 'CANCELLED') {
    return { created: false, claimId: null };
  }

  const claimsQuery = query(
    collection(db, 'paymentClaims'),
    where('sourceDocId', '==', documentId),
    limit(10)
  );

  const existingClaimsSnap = await getDocs(claimsQuery);
  const pendingClaim = existingClaimsSnap.docs.find(d => d.data()?.status === 'PENDING');

  if (pendingClaim) {
    console.log(`Pending payment claim for doc ${documentId} already exists.`);
    return { created: false, claimId: pendingClaim.id };
  }

  const newClaimRef = doc(collection(db, 'paymentClaims'));
  const newClaimData: Omit<PaymentClaim, 'id' | 'createdAt'> = {
    status: 'PENDING',
    createdByUid: userProfile?.uid ?? 'SYSTEM',
    createdByName: userProfile?.displayName ?? 'System',
    jobId: document.jobId,
    sourceDocType: document.docType as 'DELIVERY_NOTE' | 'TAX_INVOICE',
    sourceDocId: document.id,
    sourceDocNo: document.docNo,
    customerNameSnapshot: document.customerSnapshot?.name,
    amountDue: document.grandTotal,
    suggestedPaymentMethod: options?.suggestedPaymentMethod ?? document.paymentMethod as any,
    suggestedAccountId: options?.suggestedAccountId ?? document.receivedAccountId,
    note: options?.note || `Claim auto-generated from ${document.docType} action.`,
  };

  await setDoc(newClaimRef, {
      ...sanitizeForFirestore(newClaimData),
      createdAt: serverTimestamp(),
  });
  
  return { created: true, claimId: newClaimRef.id };
}
