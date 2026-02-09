import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

/**
 * Cloud Function to safely close and archive a job after accounting confirmation.
 * Runs with admin privileges to avoid client-side permission issues.
 * Region: us-central1 (default)
 */
export const closeJobAfterAccounting = onCall({ region: "us-central1", cors: true }, async (request) => {
  // 1. Authorization
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { jobId } = request.data as { jobId: string };
  if (!jobId) {
    throw new HttpsError("invalid-argument", "Missing jobId.");
  }

  // 2. Permission Check (ADMIN/MANAGER or OFFICE/MANAGEMENT department)
  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  const userData = userSnap.data();
  
  if (!userData) {
    throw new HttpsError("permission-denied", "User profile not found.");
  }

  const isAllowed = 
    ["ADMIN", "MANAGER"].includes(userData.role) || 
    ["MANAGEMENT", "OFFICE"].includes(userData.department);

  if (!isAllowed) {
    throw new HttpsError("permission-denied", "Insufficient permissions to close jobs.");
  }

  // 3. Idempotency Check: Search active jobs first, then check common archives
  const jobRef = db.collection("jobs").doc(jobId);
  const jobSnap = await jobRef.get();

  if (!jobSnap.exists) {
    // If not in active jobs, check if it's already in the archives for recent years
    const currentYear = new Date().getFullYear();
    for (const year of [currentYear, currentYear - 1]) {
      const archiveSnap = await db.collection(`jobsArchive_${year}`).doc(jobId).get();
      if (archiveSnap.exists()) {
        return { 
          ok: true, 
          jobId, 
          alreadyClosed: true, 
          archivedCollection: `jobsArchive_${year}`,
          message: "Job was already archived."
        };
      }
    }
    throw new HttpsError("not-found", `Job ${jobId} not found in active jobs or recent archives.`);
  }

  const jobData = jobSnap.data()!;
  
  // 4. Determine Archive Target based on pickup date or current date
  const closedDate = jobData.pickupDate || new Date().toISOString().split("T")[0];
  const year = parseInt(closedDate.split("-")[0]);
  const archiveColName = `jobsArchive_${year}`;
  const archiveRef = db.collection(archiveColName).doc(jobId);

  // 5. Atomic Archive (Main Doc)
  const archivedJobData = {
    ...jobData,
    status: "CLOSED",
    isArchived: true,
    archivedAt: FieldValue.serverTimestamp(),
    archivedByUid: request.auth.uid,
    archivedByName: userData.displayName || "Admin",
    closedDate: closedDate,
    updatedAt: FieldValue.serverTimestamp(),
  };

  try {
    // Write to archive (Set with merge to be safe)
    await archiveRef.set(archivedJobData, { merge: true });

    // 6. Move Activities (in chunks to handle large history)
    const activitiesRef = jobRef.collection("activities");
    const archiveActivitiesRef = archiveRef.collection("activities");
    const activitiesSnap = await activitiesRef.get();
    
    let movedCount = 0;
    if (!activitiesSnap.empty) {
      let batch = db.batch();
      let count = 0;
      
      for (const activityDoc of activitiesSnap.docs) {
        // Use same doc ID to prevent duplicates on retry
        batch.set(archiveActivitiesRef.doc(activityDoc.id), activityDoc.data());
        batch.delete(activityDoc.ref);
        count++;
        movedCount++;
        
        // Firestore batch limit is 500
        if (count >= 400) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    }

    // 7. Final Delete of the original job document
    await jobRef.delete();

    return {
      ok: true,
      jobId,
      archivedCollection: archiveColName,
      movedActivitiesCount: movedCount,
      deletedJob: true,
      alreadyClosed: false
    };

  } catch (error: any) {
    console.error("Error closing job:", error);
    throw new HttpsError("internal", error.message || "Failed to archive and delete job.");
  }
});
