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
    // Force status to CLOSED when archiving
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
 * Migration Function: Move CLOSED jobs from 'jobs' to 'jobsArchive_2026'.
 */
export const migrateClosedJobsToArchive2026 = onCall({
  region: "us-central1",
  cors: true
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

  console.info(`Migration started by UID: ${request.auth.uid}`);

  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  const userData = userSnap.data();
  const isAllowed = ["ADMIN", "MANAGER"].includes(userData?.role) || ["MANAGEMENT", "OFFICE"].includes(userData?.department);
  if (!isAllowed) throw new HttpsError("permission-denied", "Access denied.");

  const limitCount = 40;
  const archiveColName = `jobsArchive_2026`;
  
  // Query status exactly "CLOSED"
  const closedJobsSnap = await db.collection("jobs")
    .where("status", "==", "CLOSED")
    .limit(limitCount)
    .get();

  const results = { 
    ok: true, 
    totalFound: closedJobsSnap.size, 
    migrated: 0, 
    skipped: 0, 
    errors: [] as {jobId: string, message: string}[] 
  };

  if (closedJobsSnap.empty) {
    console.info("No CLOSED jobs found to migrate.");
    return results;
  }

  for (const jobDoc of closedJobsSnap.docs) {
    const jobData = jobDoc.data();
    const jobId = jobDoc.id;

    try {
      const archiveRef = db.collection(archiveColName).doc(jobId);
      
      // 1. Copy Main Document
      await archiveRef.set({
        ...jobData,
        status: "CLOSED",
        isArchived: true,
        archivedAt: FieldValue.serverTimestamp(),
        archivedByUid: request.auth.uid,
        archivedByName: userData?.displayName || "Migration",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // 2. Copy Activities Subcollection
      const activitiesSnap = await jobDoc.ref.collection("activities").get();
      if (!activitiesSnap.empty) {
        let batch = db.batch();
        let count = 0;
        for (const act of activitiesSnap.docs) {
          batch.set(archiveRef.collection("activities").doc(act.id), act.data());
          batch.delete(act.ref);
          count++;
          if (count >= 400) {
            await batch.commit();
            batch = db.batch();
            count = 0;
          }
        }
        if (count > 0) await batch.commit();
      }

      // 3. Delete Original Main Document
      await jobDoc.ref.delete();
      results.migrated++;
      console.info(`Successfully migrated job: ${jobId}`);
    } catch (e: any) {
      console.error(`Error migrating job ${jobId}:`, e);
      results.errors.push({ jobId, message: e.message });
    }
  }

  console.info(`Migration finished. Summary: found=${results.totalFound}, migrated=${results.migrated}, errors=${results.errors.length}`);
  return results;
});

/**
 * Legacy migration helper (generic)
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
    
    let dateStr = jobData.closedDate || "2026-01-01";
    if (jobData.createdAt && typeof jobData.createdAt.toDate === 'function') {
        dateStr = jobData.createdAt.toDate().toISOString().split('T')[0];
    } else if (typeof jobData.createdAt === 'string') {
        dateStr = jobData.createdAt.split('T')[0];
    }
    
    const year = parseInt(dateStr.split('-')[0]);
    
    if (year !== targetYear) {
      results.skipped++;
      continue;
    }

    try {
      const archiveRef = db.collection(archiveColName).doc(jobId);
      
      await archiveRef.set({
        ...jobData,
        status: "CLOSED",
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
