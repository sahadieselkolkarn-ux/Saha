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
  
  // Admin Guard
  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  const userData = userSnap.data();
  const isAdmin = userData?.role === 'ADMIN' || userData?.role === 'MANAGER' || userData?.department === 'MANAGEMENT';
  if (!isAdmin) throw new HttpsError("permission-denied", "เฉพาะผู้ดูแลระบบเท่านั้นที่ทำรายการนี้ได้ค่ะ");

  const limit = Math.min(request.data.limit || 40, 40);
  const closedJobsSnap = await db.collection("jobs").where("status", "==", "CLOSED").limit(limit).get();
  
  let migrated = 0;
  let skipped = 0;
  const errors: any[] = [];

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
          archivedAt: FieldValue.serverTimestamp(),
          archivedByUid: request.auth.uid,
          archivedByName: userData?.displayName || "Admin",
          updatedAt: FieldValue.serverTimestamp(),
        });
        
        // Copy activities
        const activitiesSnap = await jobDoc.ref.collection("activities").get();
        for (const actDoc of activitiesSnap.docs) {
          await archiveRef.collection("activities").doc(actDoc.id).set(actDoc.data());
        }
        migrated++;
      } else {
        skipped++;
      }

      // Delete from source (including subcollections)
      await db.recursiveDelete(jobDoc.ref);
    } catch (e: any) {
      errors.push({ jobId: jobDoc.id, message: e.message });
    }
  }

  return { totalFound: closedJobsSnap.size, migrated, skipped, errors };
});

// --- 3. ฟังก์ชัน น้องจิมมี่ (Improved Version with Full Data Access) ---
export const chatWithJimmy = onCall({ 
  region: "us-central1",
  secrets: ["GEMINI_API_KEY"] 
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "เข้าสู่ระบบก่อนนะจ๊ะพี่โจ้");
  
  // Admin/Manager Guard
  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  const userData = userSnap.data();
  const isAllowed = userData?.role === 'ADMIN' || userData?.role === 'MANAGER' || userData?.department === 'MANAGEMENT';
  
  if (!isAllowed) throw new HttpsError("permission-denied", "หน้านี้สงวนไว้สำหรับผู้บริหารเท่านั้นค่ะพี่");

  const { message } = request.data;

  // 1. Get API Key from Firestore if secret is missing
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const aiSettings = await db.collection("settings").doc("ai").get();
    apiKey = aiSettings.data()?.geminiApiKey;
  }
  if (!apiKey) throw new HttpsError("failed-precondition", "กรุณาตั้งค่า Gemini API Key ในหน้าแอปก่อนนะคะ");

  // 2. Aggregate Business Data (Admin SDK bypassing rules)
  const [activeJobsSnap, entriesSnap, workersSnap] = await Promise.all([
    db.collection("jobs").where("status", "!=", "CLOSED").get(),
    db.collection("accountingEntries").orderBy("entryDate", "desc").limit(50).get(),
    db.collection("users").where("role", "in", ["WORKER", "OFFICER"]).get()
  ]);

  // Summarize Data for Prompt
  const jobSummary = activeJobsSnap.docs.map(d => ({
    dept: d.data().department,
    status: d.data().status,
    customer: d.data().customerSnapshot?.name
  }));

  const accSummary = entriesSnap.docs.map(d => ({
    date: d.data().entryDate,
    type: d.data().entryType,
    amount: d.data().amount,
    desc: d.data().description
  }));

  const workerSummary = workersSnap.docs.map(d => ({
    name: d.data().displayName,
    dept: d.data().department,
    salary: d.data().hr?.salaryMonthly || 0
  }));

  // 3. AI Processing
  const genAI = new GoogleGenerativeAI(apiKey);
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

หากต้องแสดงตัวเลขเยอะๆ ให้สรุปเป็น "ตาราง (Markdown Table)" ที่สวยงามเสมอนะคะ`
  });

  try {
    const result = await model.generateContent(message);
    const responseText = result.response.text();
    return { answer: responseText };
  } catch (e: any) { 
    throw new HttpsError("internal", "น้องจิมมี่สับสนนิดหน่อยค่ะ: " + e.message); 
  }
});
