import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

/**
 * Cloud Function to safely close and archive a job after accounting confirmation.
 */
export const closeJobAfterAccounting = onCall({ 
  region: "us-central1",
  cors: true 
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { jobId, paymentStatus } = request.data as { jobId: string, paymentStatus?: 'PAID' | 'UNPAID' };
  if (!jobId) {
    throw new HttpsError("invalid-argument", "Missing jobId.");
  }

  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  const userData = userSnap.data();
  if (!userData) {
    throw new HttpsError("permission-denied", "User profile not found.");
  }

  const isAllowed = ["ADMIN", "MANAGER"].includes(userData.role) || ["MANAGEMENT", "OFFICE"].includes(userData.department);
  if (!isAllowed) {
    throw new HttpsError("permission-denied", "Insufficient permissions.");
  }

  const jobRef = db.collection("jobs").doc(jobId);
  const jobSnap = await jobRef.get();

  if (!jobSnap.exists) {
    const currentYear = new Date().getFullYear();
    for (const year of [currentYear, currentYear - 1]) {
      const archiveSnap = await db.collection(`jobsArchive_${year}`).doc(jobId).get();
      if (archiveSnap.exists()) {
        return { ok: true, jobId, alreadyClosed: true, archivedCollection: `jobsArchive_${year}` };
      }
    }
    throw new HttpsError("not-found", `Job ${jobId} not found.`);
  }

  const jobData = jobSnap.data()!;
  const closedDate = jobData.closedDate || new Date().toISOString().split("T")[0];
  const year = parseInt(closedDate.split("-")[0]);
  const archiveColName = `jobsArchive_${year}`;
  const archiveRef = db.collection(archiveColName).doc(jobId);

  try {
    await archiveRef.set({
      ...jobData,
      status: "CLOSED",
      isArchived: true,
      archivedAt: FieldValue.serverTimestamp(),
      archivedByUid: request.auth.uid,
      archivedByName: userData.displayName || "System",
      closedAt: FieldValue.serverTimestamp(),
      closedDate: closedDate,
      closedByUid: request.auth.uid,
      closedByName: userData.displayName || "System",
      updatedAt: FieldValue.serverTimestamp(),
      paymentStatusAtClose: paymentStatus || 'UNPAID',
    }, { merge: true });

    const activitiesSnap = await jobRef.collection("activities").get();
    if (!activitiesSnap.empty) {
      let batch = db.batch();
      let count = 0;
      for (const activityDoc of activitiesSnap.docs) {
        batch.set(archiveRef.collection("activities").doc(activityDoc.id), activityDoc.data());
        batch.delete(activityDoc.ref);
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    }

    await jobRef.delete();
    return { ok: true, jobId, archivedCollection: archiveColName };
  } catch (error: any) {
    throw new HttpsError("internal", error.message || "Failed to archive job.");
  }
});

/**
 * Migrate legacy history (CLOSED jobs in 'jobs' collection) to jobsArchive_2026.
 */
export const migrateClosedJobsToArchive = onCall({
  region: "us-central1",
  cors: true
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  const userData = userSnap.data();
  const isAllowed = ["ADMIN", "MANAGER"].includes(userData?.role) || ["MANAGEMENT", "OFFICE"].includes(userData?.department);
  if (!isAllowed) throw new HttpsError("permission-denied", "Access denied.");

  const limitCount = 40;
  const targetYear = 2026;
  const archiveColName = `jobsArchive_${targetYear}`;
  
  const closedJobsSnap = await db.collection("jobs")
    .where("status", "==", "CLOSED")
    .limit(limitCount)
    .get();

  const results = { ok: true, totalFound: closedJobsSnap.size, migrated: 0, skipped: 0, errors: [] as string[] };

  for (const jobDoc of closedJobsSnap.docs) {
    const jobData = jobDoc.data();
    const jobId = jobDoc.id;
    
    // Check if it's a 2026 job (default to 2026 if unclear)
    const dateStr = jobData.closedDate || jobData.createdAt?.toDate?.()?.toISOString()?.split('T')[0] || "2026-01-01";
    const year = parseInt(dateStr.split('-')[0]);
    
    if (year !== targetYear) {
      results.skipped++;
      continue;
    }

    try {
      const archiveRef = db.collection(archiveColName).doc(jobId);
      
      await archiveRef.set({
        ...jobData,
        isArchived: true,
        archivedAt: FieldValue.serverTimestamp(),
        archivedByUid: request.auth.uid,
        archivedByName: userData?.displayName || "Migration",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      const activitiesSnap = await jobDoc.ref.collection("activities").get();
      if (!activitiesSnap.empty) {
        let batch = db.batch();
        for (const act of activitiesSnap.docs) {
          batch.set(archiveRef.collection("activities").doc(act.id), act.data());
          batch.delete(act.ref);
        }
        await batch.commit();
      }

      await jobDoc.ref.delete();
      results.migrated++;
    } catch (e: any) {
      results.errors.push(`Job ${jobId}: ${e.message}`);
    }
  }

  return results;
});