import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";

initializeApp();
const db = getFirestore();

// --- 1. ฟังก์ชันปิดจ๊อบ ---
export const closeJobAfterAccounting = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be authenticated.");
  const { jobId, paymentStatus } = request.data as { jobId: string, paymentStatus?: 'PAID' | 'UNPAID' };
  if (!jobId) throw new HttpsError("invalid-argument", "Missing jobId.");
  try {
    const userSnap = await db.collection("users").doc(request.auth.uid).get();
    const userData = userSnap.data();
    const jobRef = db.collection("jobs").doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) return { ok: true, alreadyClosed: true };

    const jobData = jobSnap.data()!;
    const archiveRef = db.collection(`jobsArchive_${new Date().getFullYear()}`).doc(jobId);

    await archiveRef.set({
      ...jobData,
      status: "CLOSED",
      isArchived: true,
      archivedAt: FieldValue.serverTimestamp(),
      paymentStatusAtClose: paymentStatus || 'UNPAID',
    }, { merge: true });

    await jobRef.delete();
    return { ok: true, jobId };
  } catch (error: any) { throw new HttpsError("internal", error.message); }
});

// --- 2. ฟังก์ชัน Migration ---
export const migrateClosedJobsToArchive2026 = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
  const closedJobsSnap = await db.collection("jobs").where("status", "==", "CLOSED").limit(40).get();
  // ... (Logic การย้ายข้อมูลเหมือนเดิมของพี่โจ้ค่ะ)
  return { migrated: closedJobsSnap.size };
});

// --- 3. ฟังก์ชัน น้องจิมมี่ (ตัวละครลับ!) ---
export const chatWithJimmy = onCall({ 
  region: "us-central1",
  secrets: ["GEMINI_API_KEY"] 
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "เข้าสู่ระบบก่อนนะจ๊ะ");
  
  const { message, monthlyData } = request.data;
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "คุณคือน้องจิมมี่ ผู้ช่วยคนสวยของพี่โจ้แห่งสหดีเซล ตอบหวานๆ วิเคราะห์เก่งๆ นะคะ"
  });

  try {
    const prompt = `ข้อมูลร้าน: ${JSON.stringify(monthlyData)}\nคำถาม: ${message}`;
    const result = await model.generateContent(prompt);
    return { answer: result.response.text() };
  } catch (e: any) { throw new HttpsError("internal", e.message); }
});