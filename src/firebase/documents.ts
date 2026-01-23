
'use client';

import {
  type Firestore,
  doc,
  runTransaction,
  collection,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { DocumentSettings, Document, DocType, DocumentCounters, JobStatus, UserProfile } from '@/lib/types';

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


/**
 * Creates a new document in the 'documents' collection with a transactionally-generated document number.
 * @param db The Firestore instance.
 * @param docType The type of the document to create.
 * @param data The document data, excluding fields that will be generated (id, docNo, createdAt, etc.).
 * @param userProfile The profile of the user creating the document.
 * @param newJobStatus Optional new status to set for the associated job.
 * @returns The full document number.
 */
export async function createDocument(
  db: Firestore,
  docType: DocType,
  data: Omit<Document, 'id' | 'docNo' | 'docType' | 'createdAt' | 'updatedAt' | 'status'>,
  userProfile: UserProfile,
  newJobStatus?: JobStatus
): Promise<string> {
    const year = new Date(data.docDate).getFullYear();
    const counterRef = doc(db, 'documentCounters', String(year));
    const docSettingsRef = doc(db, 'settings', 'documents');
    const newDocRef = doc(collection(db, 'documents'));

    const documentNumber = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const docSettingsDoc = await transaction.get(docSettingsRef);

        if (!docSettingsDoc.exists()) {
            throw new Error("Document settings not found. Please configure document prefixes first.");
        }
        
        const settingsData = docSettingsDoc.data() as DocumentSettings;
        const prefixKey = docTypeToPrefixKey[docType];
        const prefix = settingsData[prefixKey] || docType.substring(0, 2);

        let currentCounters: DocumentCounters = { year };
        if (counterDoc.exists()) {
            currentCounters = counterDoc.data() as DocumentCounters;
        }
        
        const counterField = docTypeToCounterField[docType];
        const newCount = (currentCounters[counterField] || 0) + 1;

        const docNo = `${prefix}${year}-${String(newCount).padStart(4, '0')}`;
        
        const newDocumentData: Document = {
            ...data,
            id: newDocRef.id,
            docNo,
            docType,
            status: 'DRAFT', // Default status
            createdAt: serverTimestamp() as Timestamp,
            updatedAt: serverTimestamp() as Timestamp,
        };

        transaction.set(newDocRef, newDocumentData);
        transaction.set(counterRef, { ...currentCounters, [counterField]: newCount }, { merge: true });

        // Update Job status and add activity log if there's a Job ID
        if (data.jobId) {
            const jobRef = doc(db, 'jobs', data.jobId);
            
            // 1. Update job status if a new status is provided
            if (newJobStatus) {
                transaction.update(jobRef, { status: newJobStatus, lastActivityAt: serverTimestamp() });
            }

            // 2. Add an activity log entry for document creation
            const activityRef = doc(collection(db, 'jobs', data.jobId, 'activities'));
            transaction.set(activityRef, {
                text: `Created ${docType} document: ${docNo}`,
                userName: userProfile.displayName,
                userId: userProfile.uid,
                createdAt: serverTimestamp(),
                photos: [],
            });
        }

        return docNo;
    });

    return documentNumber;
}
