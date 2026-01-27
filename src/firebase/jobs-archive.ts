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
 * @param db The Firestore instance.
 * @param jobId The ID of the job to archive.
 * @param closedDate The 'YYYY-MM-DD' string for when the job is closed.
 * @param userProfile The profile of the user performing the action.
 * @param salesDocInfo Information about the sales document used to close the job.
 * @returns An object with the archive collection name and the job ID.
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
  const activitiesRef = collection(db, 'jobs', jobId, 'activities');
  const archiveActivitiesRef = collection(db, archiveColName, jobId, 'activities');

  // 1. Transaction to move the main job document
  await runTransaction(db, async (transaction) => {
    const jobDoc = await transaction.get(jobRef);
    if (!jobDoc.exists()) {
      throw new Error("Job not found, it might have been deleted or moved already.");
    }
    const jobData = jobDoc.data() as Job;

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

  // 2. Move the activities subcollection after the transaction succeeds
  try {
    const activitiesSnapshot = await getDocs(activitiesRef);
    if (activitiesSnapshot.empty) {
      console.log(`No activities subcollection to move for job ${jobId}.`);
      return { archiveCollection: archiveColName, archiveJobId: jobId };
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
    console.error(`Failed to move activities for job ${jobId}. The main job document was archived, but activities may remain in the original location.`, error);
    // We don't re-throw here, as the main operation was successful.
    // A background process could be used to clean up orphaned activity collections if this becomes an issue.
  }
  
  return { archiveCollection: archiveColName, archiveJobId: jobId };
}
