"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateClosedJobsToArchive2026 = exports.closeJobAfterAccounting = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
/**
 * Cloud Function to safely close and archive a job after accounting confirmation.
 */
exports.closeJobAfterAccounting = (0, https_1.onCall)({
    region: "us-central1"
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    }
    const { jobId, paymentStatus } = request.data;
    if (!jobId) {
        throw new https_1.HttpsError("invalid-argument", "Missing jobId.");
    }
    try {
        const userSnap = await db.collection("users").doc(request.auth.uid).get();
        const userData = userSnap.data();
        if (!userData) {
            throw new https_1.HttpsError("permission-denied", "User profile not found.");
        }
        const isAllowed = ["ADMIN", "MANAGER"].includes(userData.role) || ["MANAGEMENT", "OFFICE"].includes(userData.department);
        if (!isAllowed) {
            throw new https_1.HttpsError("permission-denied", "Insufficient permissions.");
        }
        const jobRef = db.collection("jobs").doc(jobId);
        const jobSnap = await jobRef.get();
        if (!jobSnap.exists) {
            const currentYear = new Date().getFullYear();
            for (const year of [currentYear, currentYear - 1]) {
                const archiveSnap = await db.collection(`jobsArchive_${year}`).doc(jobId).get();
                if (archiveSnap.exists) {
                    return { ok: true, jobId, alreadyClosed: true, archivedCollection: `jobsArchive_${year}` };
                }
            }
            throw new https_1.HttpsError("not-found", `Job ${jobId} not found.`);
        }
        const jobData = jobSnap.data();
        const closedDate = jobData.closedDate || new Date().toISOString().split("T")[0];
        const year = parseInt(closedDate.split("-")[0]);
        const archiveColName = `jobsArchive_${year}`;
        const archiveRef = db.collection(archiveColName).doc(jobId);
        // Force status to CLOSED when archiving
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
            if (count > 0)
                await batch.commit();
        }
        await jobRef.delete();
        return { ok: true, jobId, archivedCollection: archiveColName };
    }
    catch (error) {
        console.error("Archive error:", error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError("internal", error.message || "Failed to archive job.");
    }
});
/**
 * Robust Migration Function: Move CLOSED jobs from 'jobs' to 'jobsArchive_2026' with subcollection activities.
 */
exports.migrateClosedJobsToArchive2026 = (0, https_1.onCall)({
    region: "us-central1"
}, async (request) => {
    var _a, _b;
    // 1. Auth Guard
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    }
    try {
        // 2. Permission Guard
        const userSnap = await db.collection("users").doc(request.auth.uid).get();
        const userData = userSnap.data();
        const isAllowed = ["ADMIN", "MANAGER"].includes(userData === null || userData === void 0 ? void 0 : userData.role) || ["MANAGEMENT", "OFFICE"].includes(userData === null || userData === void 0 ? void 0 : userData.department);
        if (!isAllowed) {
            throw new https_1.HttpsError("permission-denied", "You do not have permission to run migrations.");
        }
        const limitCount = Math.min(((_a = request.data) === null || _a === void 0 ? void 0 : _a.limit) || 40, 40);
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
            errors: []
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
                // Skip if already moved but not deleted
                if (archiveSnap.exists && ((_b = archiveSnap.data()) === null || _b === void 0 ? void 0 : _b.isArchived)) {
                    if (typeof db.recursiveDelete === 'function') {
                        await db.recursiveDelete(jobDoc.ref);
                    }
                    else {
                        await jobDoc.ref.delete();
                    }
                    results.skipped++;
                    continue;
                }
                // 1. Copy Main Job Document to Archive
                await archiveRef.set({
                    ...jobData,
                    status: "CLOSED",
                    isArchived: true,
                    archivedAt: firestore_1.FieldValue.serverTimestamp(),
                    archivedByUid: request.auth.uid,
                    archivedByName: (userData === null || userData === void 0 ? void 0 : userData.displayName) || "Migration",
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                }, { merge: true });
                // 2. Copy Activities Subcollection
                const activitiesSnap = await jobDoc.ref.collection("activities").get();
                if (!activitiesSnap.empty) {
                    const writer = db.bulkWriter();
                    for (const act of activitiesSnap.docs) {
                        writer.set(archiveRef.collection("activities").doc(act.id), act.data());
                    }
                    await writer.close();
                }
                // 3. Recursive Delete source
                if (typeof db.recursiveDelete === 'function') {
                    await db.recursiveDelete(jobDoc.ref);
                }
                else {
                    await jobDoc.ref.delete();
                }
                results.migrated++;
            }
            catch (e) {
                console.error(`Error migrating job ${jobId}:`, e);
                results.errors.push({ jobId, message: e.message || "Unknown error during copy/delete" });
            }
        }
        console.info(`Migration finished: ${results.migrated} migrated, ${results.skipped} skipped.`);
        return results;
    }
    catch (error) {
        console.error("Top-level migration error:", error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError("internal", error.message || "Failed to process migration.");
    }
});
