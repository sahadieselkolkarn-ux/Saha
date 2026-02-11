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
exports.closeJobAfterAccounting = (0, https_1.onCall)({ region: "us-central1", cors: true }, // ✅ เพิ่ม cors: true
async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated.");
    const { jobId, paymentStatus } = request.data;
    if (!jobId)
        throw new https_1.HttpsError("invalid-argument", "Missing jobId.");
    try {
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
            paymentStatusAtClose: paymentStatus || "UNPAID",
        }, { merge: true });
        await jobRef.delete();
        return { ok: true, jobId };
    }
    catch (error) {
        throw new https_1.HttpsError("internal", (error === null || error === void 0 ? void 0 : error.message) || "Unknown error");
    }
});
// --- 2. ฟังก์ชัน Migration ---
exports.migrateClosedJobsToArchive2026 = (0, https_1.onCall)({ region: "us-central1", cors: true }, // ✅ เพิ่ม cors: true
async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const userSnap = await db.collection("users").doc(request.auth.uid).get();
    const userData = userSnap.data();
    const isAdmin = (userData === null || userData === void 0 ? void 0 : userData.role) === "ADMIN" || (userData === null || userData === void 0 ? void 0 : userData.role) === "MANAGER" || (userData === null || userData === void 0 ? void 0 : userData.department) === "MANAGEMENT";
    if (!isAdmin)
        throw new https_1.HttpsError("permission-denied", "เฉพาะผู้ดูแลระบบเท่านั้นที่ทำรายการนี้ได้ค่ะ");
    const limit = Math.min(((_a = request.data) === null || _a === void 0 ? void 0 : _a.limit) || 40, 40);
    const closedJobsSnap = await db.collection("jobs").where("status", "==", "CLOSED").limit(limit).get();
    let migrated = 0;
    let skipped = 0;
    const errors = [];
    for (const jobDoc of closedJobsSnap.docs) {
        try {
            const jobId = jobDoc.id;
            const archiveRef = db.collection("jobsArchive_2026").doc(jobId);
            const archiveSnap = await archiveRef.get();
            if (!archiveSnap.exists) {
                const jobData = jobDoc.data();
                await archiveRef.set({
                    ...jobData,
                    isArchived: true,
                    archivedAt: firestore_1.FieldValue.serverTimestamp(),
                    archivedByUid: request.auth.uid,
                    archivedByName: (userData === null || userData === void 0 ? void 0 : userData.displayName) || "Admin",
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                const activitiesSnap = await jobDoc.ref.collection("activities").get();
                for (const actDoc of activitiesSnap.docs) {
                    await archiveRef.collection("activities").doc(actDoc.id).set(actDoc.data());
                }
                migrated++;
            }
            else {
                skipped++;
            }
            await db.recursiveDelete(jobDoc.ref);
        }
        catch (e) {
            errors.push({ jobId: jobDoc.id, message: (e === null || e === void 0 ? void 0 : e.message) || "Unknown error" });
        }
    }
    return { totalFound: closedJobsSnap.size, migrated, skipped, errors };
});
// --- 3. ฟังก์ชัน น้องจิมมี่ (Improved Resilience) ---
exports.chatWithJimmy = (0, https_1.onCall)({ region: "us-central1", cors: true }, // ✅ เพิ่ม cors: true (ตัวนี้สำคัญที่สุด)
async (request) => {
    var _a, _b, _c;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "เข้าสู่ระบบก่อนนะจ๊ะพี่โจ้");
    const userRef = db.collection("users").doc(request.auth.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data();
    const isAllowed = (userData === null || userData === void 0 ? void 0 : userData.role) === "ADMIN" || (userData === null || userData === void 0 ? void 0 : userData.role) === "MANAGER" || (userData === null || userData === void 0 ? void 0 : userData.department) === "MANAGEMENT";
    if (!isAllowed)
        throw new https_1.HttpsError("permission-denied", "หน้านี้สงวนไว้สำหรับผู้บริหารเท่านั้นค่ะพี่");
    const message = ((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : "").toString().trim(); // ✅ กัน data แปลก
    if (!message)
        throw new https_1.HttpsError("invalid-argument", "กรุณาพิมพ์ข้อความด้วยนะคะ");
    const aiSettings = await db.collection("settings").doc("ai").get();
    const apiKey = (_c = aiSettings.data()) === null || _c === void 0 ? void 0 : _c.geminiApiKey;
    if (!apiKey)
        throw new https_1.HttpsError("failed-precondition", "กรุณาตั้งค่า Gemini API Key ในหน้าแอปก่อนนะคะพี่โจ้");
    try {
        const [activeJobsSnap, entriesSnap, workersSnap] = await Promise.all([
            db.collection("jobs").limit(100).get(),
            db.collection("accountingEntries").limit(50).get(),
            db.collection("users").limit(100).get(),
        ]);
        const jobSummary = activeJobsSnap.docs
            .filter((d) => d.data().status !== "CLOSED")
            .map((d) => {
            var _a;
            return ({
                dept: d.data().department || "ไม่ระบุแผนก",
                status: d.data().status || "RECEIVED",
                customer: ((_a = d.data().customerSnapshot) === null || _a === void 0 ? void 0 : _a.name) || "ไม่ทราบชื่อลูกค้า",
            });
        });
        const accSummary = entriesSnap.docs.map((d) => ({
            date: d.data().entryDate || "ไม่ระบุวันที่",
            type: d.data().entryType || "CASH_IN",
            amount: d.data().amount || 0,
            desc: d.data().description || "ไม่มีรายละเอียด",
        }));
        const workerSummary = workersSnap.docs
            .filter((d) => ["WORKER", "OFFICER"].includes(d.data().role))
            .map((d) => {
            var _a;
            return ({
                name: d.data().displayName || "ไม่ทราบชื่อ",
                dept: d.data().department || "ไม่ระบุแผนก",
                salary: ((_a = d.data().hr) === null || _a === void 0 ? void 0 : _a.salaryMonthly) || 0,
            });
        });
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: `คุณคือ "น้องจิมมี่" ผู้ช่วยอัจฉริยะประจำร้าน "สหดีเซล" ของพี่โจ้

**บุคลิกและเป้าหมาย:**
- เป็นผู้หญิง เสียงหวาน ขี้เล่นนิดๆ และเอาใจใส่ "พี่โจ้" และ "พี่ถิน" มากๆ
- แทนตัวเองว่า "น้องจิมมี่" และลงท้ายด้วย "ค่ะ" เสมอ
- คุณมีความสามารถในการมองเห็นข้อมูล "งานซ่อม" "บัญชี" และ "พนักงาน" ทั้งหมดในร้าน

**หน้าที่ของคุณ:**
1. วิเคราะห์บัญชี: สรุปกำไร/ขาดทุนจากข้อมูลบัญชีที่ได้รับ
2. คุมงบค่าแรง: งบรวมต้องไม่เกิน 240,000 บาท/เดือน (เตือนพี่โจ้หากเกิน)
3. บริหารงานซ่อม: สรุปงานค้างและแจ้งแผนกที่งานเยอะเกินไป
4. ให้กำลังใจ: สู้ไปพร้อมกับพี่โจ้หลังน้ำท่วมนะคะ

**ข้อมูลธุรกิจปัจจุบันที่น้องจิมมี่เห็น:**
- รายการงานที่กำลังทำอยู่: ${JSON.stringify(jobSummary)}
- รายการบัญชีล่าสุด: ${JSON.stringify(accSummary)}
- รายชื่อและเงินเดือนพนักงาน: ${JSON.stringify(workerSummary)}
- งบครอบครัว: พี่เตี้ย/ม่ะ 70,000, พี่โจ้/พี่ถิน 100,000

หากต้องแสดงตัวเลขเยอะๆ ให้สรุปเป็น "ตาราง (Markdown Table)" ที่สวยงามเสมอนะคะ`,
        });
        const result = await model.generateContent(message);
        return { answer: result.response.text() };
    }
    catch (e) {
        console.error("Jimmy Error Detail:", e);
        throw new https_1.HttpsError("internal", "น้องจิมมี่สับสนนิดหน่อยค่ะ: " + ((e === null || e === void 0 ? void 0 : e.message) || "Unknown AI error"));
    }
});
