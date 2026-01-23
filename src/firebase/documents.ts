
'use client';

import {
  type Firestore,
  doc,
  runTransaction,
  collection,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { DocumentSettings, Document, DocType, DocumentCounters, JobStatus } from '@/lib/types';

const docTypeToCounterField: Record<DocType, keyof Omit<DocumentCounters, 'year'>> = {
    QUOTATION: 'quotation',
    DELIVERY_NOTE: 'deliveryNote',
    TAX_INVOICE: 'taxInvoice',
    RECEIPT: 'receipt',
    BILLING_NOTE: 'billingNote',
    CREDIT_NOTE: 'creditNote',
    WITHHOLDING_TAX: 'withholdingTax',
};

/**
 * Creates a new document in the 'documents' collection with a transactionally-generated document number.
 * @param db The Firestore instance.
 * @param docType The type of the document to create.
 * @param data The document data, excluding fields that will be generated (id, docNo, createdAt, etc.).
 * @returns The full document number.
 */
export async function createDocument(
  db: Firestore,
  docType: DocType,
  data: Omit<Document, 'id' | 'docNo' | 'docType' | 'createdAt' | 'updatedAt' | 'status'>,
  newJobStatus?: JobStatus
): Promise<string> {
    const year = new Date(data.docDate).getFullYear();
    const counterRef = doc(db, 'settings/documentCounters', String(year));
    const docSettingsRef = doc(db, 'settings', 'documents');
    const newDocRef = doc(collection(db, 'documents'));

    const documentNumber = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const docSettingsDoc = await transaction.get(docSettingsRef);

        if (!docSettingsDoc.exists()) {
            throw new Error("Document settings not found. Please configure document prefixes first.");
        }
        
        const settingsData = docSettingsDoc.data() as DocumentSettings;
        // The key for quotationPrefix is "quotationPrefix" not "QUOTATIONPrefix"
        const prefixKey = `${docType.charAt(0).toLowerCase()}${docType.slice(1).replace(/_/g, '')}Prefix` as keyof DocumentSettings;
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

        // Update Job status if provided
        if (data.jobId && newJobStatus) {
            const jobRef = doc(db, 'jobs', data.jobId);
            transaction.update(jobRef, { status: newJobStatus, lastActivityAt: serverTimestamp() });
        }

        return docNo;
    });

    return documentNumber;
}

    