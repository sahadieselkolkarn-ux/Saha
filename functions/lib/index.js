"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeJobAfterAccounting = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
/**
 * Cloud Function to safely close and archive a job after accounting confirmation.
 * Uses the V2 Callable (onCall) pattern to handle CORS and auth automatically.
 * Region: us-central1
 */
exports.closeJobAfterAccounting = (0, https_1.onCall)({
    region: "us-central1",
    cors: true
}, async (request) => {
    // 1. Authorization Check
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    }
    const { jobId, paymentStatus } = request.data;
    if (!jobId) {
        throw new https_1.HttpsError("invalid-argument", "Missing jobId.");
    }
    // 2. Permission Check (ADMIN/MANAGER or OFFICE/MANAGEMENT department)
    const userSnap = await db.collection("users").doc(request.auth.uid).get();
    const userData = userSnap.data();
    if (!userData) {
        throw new https_1.HttpsError("permission-denied", "User profile not found.");
    }
    const isAllowed = ["ADMIN", "MANAGER"].includes(userData.role) ||
        ["MANAGEMENT", "OFFICE"].includes(userData.department);
    if (!isAllowed) {
        throw new https_1.HttpsError("permission-denied", "Insufficient permissions to close jobs.");
    }
    // 3. Idempotency Check: Search active jobs first, then check archives
    const jobRef = db.collection("jobs").doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) {
        // If not in active jobs, check if it's already in the archives for recent years
        const currentYear = new Date().getFullYear();
        for (const year of [currentYear, currentYear - 1]) {
            const archiveSnap = await db.collection(`jobsArchive_${year}`).doc(jobId).get();
            if (archiveSnap.exists) {
                return {
                    ok: true,
                    jobId,
                    alreadyClosed: true,
                    archivedCollection: `jobsArchive_${year}`,
                    message: "Job was already archived."
                };
            }
        }
        throw new https_1.HttpsError("not-found", `Job ${jobId} not found in active jobs or recent archives.`);
    }
    const jobData = jobSnap.data();
    // 4. Determine Archive Target
    const closedDate = jobData.closedDate || jobData.pickupDate || new Date().toISOString().split("T")[0];
    const year = parseInt(closedDate.split("-")[0]);
    const archiveColName = `jobsArchive_${year}`;
    const archiveRef = db.collection(archiveColName).doc(jobId);
    try {
        // 5. Atomic Archive (Main Doc)
        // CRITICAL: Explicitly set status to CLOSED and add audit fields
        await archiveRef.set({
            ...jobData,
            status: "CLOSED",
            isArchived: true,
            archivedAt: firestore_1.FieldValue.serverTimestamp(),
            archivedByUid: request.auth.uid,
            archivedByName: userData.displayName || "System",
            closedAt: firestore_1.FieldValue.serverTimestamp(),
            closedDate: closedDate,
            closedByUid: request.auth.uid,
            closedByName: userData.displayName || "System",
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            paymentStatusAtClose: paymentStatus || jobData.paymentStatusAtClose || 'UNPAID',
        }, { merge: true });
        // 6. Move Activities (in chunks)
        const activitiesRef = jobRef.collection("activities");
        const archiveActivitiesRef = archiveRef.collection("activities");
        const activitiesSnap = await activitiesRef.get();
        let movedCount = 0;
        if (!activitiesSnap.empty) {
            let batch = db.batch();
            let count = 0;
            for (const activityDoc of activitiesSnap.docs) {
                batch.set(archiveActivitiesRef.doc(activityDoc.id), activityDoc.data());
                batch.delete(activityDoc.ref);
                count++;
                movedCount++;
                if (count >= 400) {
                    await batch.commit();
                    batch = db.batch();
                    count = 0;
                }
            }
            if (count > 0)
                await batch.commit();
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
    }
    catch (error) {
        console.error("Error closing job:", error);
        throw new https_1.HttpsError("internal", error.message || "Failed to archive and delete job.");
    }
});
