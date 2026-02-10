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
 * Robust Migration Function: Move CLOSED jobs from 'jobs' to 'jobsArchive_2026' with subcollection activities.
 */
export const migrateClosedJobsToArchive2026 = onCall({
  region: "us-central1",
  cors: true
}, async (request) => {
  // 1. Auth Guard
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  // 2. Permission Guard
  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  const userData = userSnap.data();
  const isAllowed = ["ADMIN", "MANAGER"].includes(userData?.role) || ["MANAGEMENT", "OFFICE"].includes(userData?.department);
  if (!isAllowed) {
    throw new HttpsError("permission-denied", "You do not have permission to run migrations.");
  }

  const limitCount = Math.min(request.data?.limit || 40, 40);
  const archiveColName = `jobsArchive_2026`;
  
  // 3. Query CLOSED jobs from main collection
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
    return results;
  }

  console.info(`Starting migration for ${closedJobsSnap.size} jobs initiated by ${request.auth.uid}`);

  for (const jobDoc of closedJobsSnap.docs) {
    const jobData = jobDoc.data();
    const jobId = jobDoc.id;

    try {
      const archiveRef = db.collection(archiveColName).doc(jobId);
      const archiveSnap = await archiveRef.get();

      // Skip if already moved but not deleted (shouldn't happen often but for safety)
      if (archiveSnap.exists && archiveSnap.data()?.isArchived) {
        // If it exists in archive but still in jobs, delete from jobs and skip count
        await db.recursiveDelete(jobDoc.ref);
        results.skipped++;
        continue;
      }

      // 1. Copy Main Job Document to Archive
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
        // Use BulkWriter for more reliable subcollection copying if many activities
        const writer = db.bulkWriter();
        for (const act of activitiesSnap.docs) {
          writer.set(archiveRef.collection("activities").doc(act.id), act.data());
        }
        await writer.close();
      }

      // 3. Recursive Delete source (deletes subcollections too)
      await db.recursiveDelete(jobDoc.ref);
      
      results.migrated++;
      console.info(`Successfully migrated job: ${jobId}`);
    } catch (e: any) {
      console.error(`Error migrating job ${jobId}:`, e);
      results.errors.push({ jobId, message: e.message });
    }
  }

  console.info(`Migration finished: ${results.migrated} migrated, ${results.skipped} skipped, ${results.errors.length} errors.`);
  return results;
});
