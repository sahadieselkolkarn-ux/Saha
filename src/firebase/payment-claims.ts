

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
} from 'firebase/firestore';
import type { Document, UserProfile, PaymentClaim } from '@/lib/types';
import { sanitizeForFirestore } from '@/lib/utils';

/**
 * Ensures a payment claim exists for a given sales document.
 * If a pending claim for the document already exists, it does nothing.
 * Otherwise, it creates a new pending payment claim.
 *
 * @param db The Firestore instance.
 * @param documentId The ID of the source document (e.g., DELIVERY_NOTE, TAX_INVOICE).
 * @param userProfile The profile of the user who initiated the action.
 * @returns A promise that resolves to an object with a `created` boolean.
 */
export async function ensurePaymentClaimForDocument(
  db: Firestore,
  documentId: string,
  userProfile?: UserProfile | null
): Promise<{ created: boolean }> {
  
  try {
    const docRef = doc(db, 'documents', documentId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.error(`ensurePaymentClaimForDocument: Document with ID ${documentId} not found.`);
      return { created: false };
    }

    const document = docSnap.data() as Document;

    // Only create claims for specific document types that aren't cancelled.
    if (!['DELIVERY_NOTE', 'TAX_INVOICE'].includes(document.docType) || document.status === 'CANCELLED') {
      return { created: false };
    }

    // Check if a pending claim already exists for this document to prevent duplicates.
    const claimsQuery = query(
      collection(db, 'paymentClaims'),
      where('sourceDocId', '==', documentId),
      limit(10) // Fetch a few potential claims to check client-side
    );

    const existingClaimsSnap = await getDocs(claimsQuery);
    const hasPendingClaim = existingClaimsSnap.docs.some(d => d.data()?.status === 'PENDING');

    if (hasPendingClaim) {
      // A pending claim already exists, do nothing.
      console.log(`Pending payment claim for doc ${documentId} already exists.`);
      return { created: false };
    }

    // No pending claim found, so create one.
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
      suggestedPaymentMethod: document.paymentMethod as any,
      suggestedAccountId: document.receivedAccountId,
      note: `Claim auto-generated from ${document.docType} creation/action.`,
    };

    await addDoc(collection(db, 'paymentClaims'), {
        ...sanitizeForFirestore(newClaimData),
        createdAt: serverTimestamp(),
    });
    
    return { created: true };
  } catch (error) {
    console.error("Error in ensurePaymentClaimForDocument:", error);
    // Don't re-throw the error, as it might block the primary form submission.
    // The main function should succeed, even if this secondary action fails.
    return { created: false };
  }
}
