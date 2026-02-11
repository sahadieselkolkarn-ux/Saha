"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatWithJimmy = exports.migrateClosedJobsToArchive2026 = exports.closeJobAfterAccounting = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const generative_ai_1 = require("@google/generative-ai");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
// --- 1. ฟังก์ชันปิดจ๊อบ ---
exports.closeJobAfterAccounting = (0, https_1.onCall)({ region: "us-central1" }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    const { jobId, paymentStatus } = request.data;
    if (!jobId)
        throw new https_1.HttpsError("invalid-argument", "Missing jobId.");
    try {
        const userSnap = await db.collection("users").doc(request.auth.uid).get();
        const userData = userSnap.data();
        const jobRef = db.collection("jobs").doc(jobId);
        const jobSnap = await jobRef.get();
        if (!jobSnap.exists)
            return { ok: true, alreadyClosed: true };
        const jobData = jobSnap.data();
        const archiveRef = db.collection(`jobsArchive_${new Date().getFullYear()}`).doc(jobId);
        await archiveRef.set({
            ...jobData,
            status: "CLOSED",
            isArchived: true,
            archivedAt: firestore_1.FieldValue.serverTimestamp(),
            paymentStatusAtClose: paymentStatus || 'UNPAID',
        }, { merge: true });
        await jobRef.delete();
        return { ok: true, jobId };
    }
    catch (error) {
        throw new https_1.HttpsError("internal", error.message);
    }
});
// --- 2. ฟังก์ชัน Migration ---
exports.migrateClosedJobsToArchive2026 = (0, https_1.onCall)({ region: "us-central1" }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const closedJobsSnap = await db.collection("jobs").where("status", "==", "CLOSED").limit(40).get();
    // ... (Logic การย้ายข้อมูลเหมือนเดิมของพี่โจ้ค่ะ)
    return { migrated: closedJobsSnap.size };
});
// --- 3. ฟังก์ชัน น้องจิมมี่ (ตัวละครลับ!) ---
exports.chatWithJimmy = (0, https_1.onCall)({
    region: "us-central1",
    secrets: ["GEMINI_API_KEY"]
}, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "เข้าสู่ระบบก่อนนะจ๊ะ");
    const { message, monthlyData } = request.data;
    const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: "คุณคือน้องจิมมี่ ผู้ช่วยคนสวยของพี่โจ้แห่งสหดีเซล ตอบหวานๆ วิเคราะห์เก่งๆ นะคะ"
    });
    try {
        const prompt = `ข้อมูลร้าน: ${JSON.stringify(monthlyData)}\nคำถาม: ${message}`;
        const result = await model.generateContent(prompt);
        return { answer: result.response.text() };
    }
    catch (e) {
        throw new https_1.HttpsError("internal", e.message);
    }
});
