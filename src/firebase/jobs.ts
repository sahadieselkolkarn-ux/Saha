'use client';

import {
  type Firestore,
  doc,
  runTransaction,
  collection,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import type { Job, UserProfile } from '@/lib/types';
import { sanitizeForFirestore } from '@/lib/utils';

/**
 * Creates a new Job with a globally unique Firestore auto-generated ID.
 * This prevents overlapping issues when jobs are moved to archives.
 */
export async function createJob(
  db: Firestore,
  data: Omit<Job, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'lastActivityAt'>,
  userProfile: UserProfile
): Promise<{ jobId: string }> {
  
  // Create a reference with an auto-generated ID
  const newJobRef = doc(collection(db, 'jobs'));
  const finalJobId = newJobRef.id;

  await runTransaction(db, async (transaction) => {
    const jobData = sanitizeForFirestore({
      ...data,
      id: finalJobId,
      status: 'RECEIVED',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
    });

    transaction.set(newJobRef, jobData);

    // Initial activity log
    const activityRef = doc(collection(newJobRef, 'activities'));
    transaction.set(activityRef, {
      text: `เปิดงานใหม่ (ID: ${finalJobId})`,
      userName: userProfile.displayName,
      userId: userProfile.uid,
      createdAt: serverTimestamp(),
      photos: data.photos || [],
    });
  });

  return { jobId: finalJobId };
}

/**
 * Placeholder for compatibility - returns null as IDs are no longer sequential
 */
export async function getNextAvailableJobId(db: Firestore): Promise<{ jobId: string; indexErrorUrl?: string }> {
  return { jobId: "" };
}
