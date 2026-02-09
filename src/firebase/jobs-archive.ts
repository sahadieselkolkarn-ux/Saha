'use client';

import {
  type Firestore,
  doc,
  collection,
  runTransaction,
  serverTimestamp,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { getYearFromDateOnly, archiveCollectionNameByYear } from '@/lib/archive-utils';
import type { UserProfile, Job } from '@/lib/types';
import { sanitizeForFirestore } from '@/lib/utils';

/**
 * Moves a job and its activities subcollection to an annual archive collection.
 * This is done in a transaction for the main documents and batched writes for subcollections.
 */
export async function archiveAndCloseJob(
  db: Firestore,
  jobId: string,
  closedDate: string,
  userProfile: UserProfile,
  salesDocInfo: { salesDocType: string; salesDocId: string; salesDocNo: string; paymentStatusAtClose: 'PAID' | 'UNPAID'; }
) {
  const jobRef = doc(db, 'jobs', jobId);
  const year = getYearFromDateOnly(closedDate);
  const archiveColName = archiveCollectionNameByYear(year);
  const archiveCol = collection(db, archiveColName);
  const archiveRef = doc(archiveCol, jobId);

  // 1. Transaction to move the main job document and update the linked sales document
  await runTransaction(db, async (transaction) => {
    const jobDoc = await transaction.get(jobRef);
    if (!jobDoc.exists()) {
      throw new Error("Job not found, it might have been deleted or moved already.");
    }
    const jobData = jobDoc.data() as Job;

    // Update the sales document to point to this job (to ensure it shows up in history)
    if (salesDocInfo.salesDocId) {
        const docRef = doc(db, 'documents', salesDocInfo.salesDocId);
        transaction.update(docRef, { 
            jobId: jobId, 
            updatedAt: serverTimestamp() 
        });
    }

    const archivedJobData = {
      ...jobData,
      status: 'CLOSED', // Ensure status is CLOSED
      isArchived: true,
      archivedAt: serverTimestamp(),
      archivedAtDate: closedDate,
      closedDate: closedDate,
      closedByName: userProfile.displayName,
      closedByUid: userProfile.uid,
      originalJobId: jobId,
      ...salesDocInfo,
    };
    
    transaction.set(archiveRef, sanitizeForFirestore(archivedJobData), { merge: true });
    transaction.delete(jobRef);
  });

  // 2. Move activities subcollection
  await moveJobActivities(db, jobId, archiveColName);
  
  return { archiveCollection: archiveColName, archiveJobId: jobId };
}

/**
 * Moves ONLY the activities subcollection from active jobs to archive.
 */
export async function moveJobActivities(db: Firestore, jobId: string, targetCollectionName: string) {
  const activitiesRef = collection(db, 'jobs', jobId, 'activities');
  const archiveActivitiesRef = collection(db, targetCollectionName, jobId, 'activities');

  try {
    const activitiesSnapshot = await getDocs(activitiesRef);
    if (activitiesSnapshot.empty) {
      return;
    }

    let writeBatchCount = 0;
    let batch = writeBatch(db);
    const docsToDelete: any[] = [];

    for (const activityDoc of activitiesSnapshot.docs) {
      const newActivityRef = doc(archiveActivitiesRef, activityDoc.id);
      batch.set(newActivityRef, activityDoc.data());
      docsToDelete.push(activityDoc.ref);
      writeBatchCount++;

      if (writeBatchCount >= 400) {
        await batch.commit();
        const deleteBatch = writeBatch(db);
        docsToDelete.forEach(ref => deleteBatch.delete(ref));
        await deleteBatch.commit();
        
        batch = writeBatch(db);
        writeBatchCount = 0;
        docsToDelete.length = 0;
      }
    }

    if (writeBatchCount > 0) {
      await batch.commit();
      const deleteBatch = writeBatch(db);
      docsToDelete.forEach(ref => deleteBatch.delete(ref));
      await deleteBatch.commit();
    }
  } catch (error) {
    console.error(`Failed to move activities for job ${jobId}.`, error);
  }
}
