import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";

initializeApp();
const db = getFirestore();

// --- 1. ฟังก์ชันปิดจ๊อบ ---
export const closeJobAfterAccounting = onCall(
  { region: "us-central1", cors: true }, 
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "User must be authenticated.");

    const { jobId, paymentStatus } = request.data as { jobId: string; paymentStatus?: "PAID" | "UNPAID" };
    if (!jobId) throw new HttpsError("invalid-argument", "Missing jobId.");

    try {
      const jobRef = db.collection("jobs").doc(jobId);
      const jobSnap = await jobRef.get();
      if (!jobSnap.exists) return { ok: true, alreadyClosed: true };

      const jobData = jobSnap.data()!;
      const now = new Date();
      const year = now.getFullYear();
      const closedDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
      
      const archiveRef = db.collection(`jobsArchive_${year}`).doc(jobId);

      await archiveRef.set(
        {
          ...jobData,
          status: "CLOSED",
          isArchived: true,
          archivedAt: FieldValue.serverTimestamp(),
          archivedAtDate: closedDate,
          closedDate: closedDate,
          paymentStatusAtClose: paymentStatus || "UNPAID",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await jobRef.delete();
      return { ok: true, jobId };
    } catch (error: any) {
      throw new HttpsError("internal", error?.message || "Unknown error");
    }
  }
);

// --- 2. ฟังก์ชัน Migration ---
export const migrateClosedJobsToArchive2026 = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

    const userSnap = await db.collection("users").doc(request.auth.uid).get();
    const userData = userSnap.data();
    const isAdmin =
      userData?.role === "ADMIN" || userData?.role === "MANAGER" || userData?.department === "MANAGEMENT";
    if (!isAdmin) throw new HttpsError("permission-denied", "เฉพาะผู้ดูแลระบบเท่านั้นที่ทำรายการนี้ได้ค่ะ");

    const limitCount = Math.min(request.data?.limit || 40, 40);
    const closedJobsSnap = await db.collection("jobs").where("status", "==", "CLOSED").limit(limitCount).get();

    let migrated = 0;
    let skipped = 0;
    const errors: any[] = [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const defaultClosedDate = now.toISOString().split('T')[0];

    for (const jobDoc of closedJobsSnap.docs) {
      try {
        const jobId = jobDoc.id;
        const jobData = jobDoc.data();
        
        // Determine the archive year and closed date
        const jobDate = jobData.closedDate || jobData.updatedAt?.toDate?.()?.toISOString().split('T')[0] || defaultClosedDate;
        const archiveYear = jobDate.startsWith('2026') ? 2026 : currentYear;
        
        const archiveRef = db.collection(`jobsArchive_${archiveYear}`).doc(jobId);
        const archiveSnap = await archiveRef.get();

        if (!archiveSnap.exists) {
          await archiveRef.set({
            ...jobData,
            status: "CLOSED",
            isArchived: true,
            archivedAt: FieldValue.serverTimestamp(),
            archivedAtDate: jobDate,
            closedDate: jobDate,
            archivedByUid: request.auth.uid,
            archivedByName: userData?.displayName || "Admin",
            updatedAt: FieldValue.serverTimestamp(),
          });

          const activitiesSnap = await jobDoc.ref.collection("activities").get();
          for (const actDoc of activitiesSnap.docs) {
            await archiveRef.collection("activities").doc(actDoc.id).set(actDoc.data());
          }

          migrated++;
        } else {
          skipped++;
        }

        await db.recursiveDelete(jobDoc.ref);
      } catch (e: any) {
        errors.push({ jobId: jobDoc.id, message: e?.message || "Unknown error" });
      }
    }

    return { totalFound: closedJobsSnap.size, migrated, skipped, errors };
  }
);

// --- 3. ฟังก์ชัน น้องจิมมี่ ---
export const chatWithJimmy = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "เข้าสู่ระบบก่อนนะจ๊ะพี่โจ้");

    const userRef = db.collection("users").doc(request.auth.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data();

    const isAllowed =
      userData?.role === "ADMIN" || userData?.role === "MANAGER" || userData?.department === "MANAGEMENT";
    if (!isAllowed) throw new HttpsError("permission-denied", "หน้านี้สงวนไว้สำหรับผู้บริหารเท่านั้นค่ะพี่");

    const message = (request.data?.message ?? "").toString().trim();
    if (!message) throw new HttpsError("invalid-argument", "กรุณาพิมพ์ข้อความด้วยนะคะ");

    const aiSettings = await db.collection("settings").doc("ai").get();
    const apiKey = aiSettings.data()?.geminiApiKey;
    if (!apiKey)
      throw new HttpsError("failed-precondition", "กรุณาตั้งค่า Gemini API Key ในหน้าแอปก่อนนะคะพี่โจ้");

    try {
      const [activeJobsSnap, entriesSnap, workersSnap] = await Promise.all([
        db.collection("jobs").limit(100).get(),
        db.collection("accountingEntries").limit(50).get(),
        db.collection("users").limit(100).get(),
      ]);

      const jobSummary = activeJobsSnap.docs
        .filter((d) => d.data().status !== "CLOSED")
        .map((d) => ({
          dept: d.data().department || "ไม่ระบุแผนก",
          status: d.data().status || "RECEIVED",
          customer: d.data().customerSnapshot?.name || "ไม่ทราบชื่อลูกค้า",
        }));

      const accSummary = entriesSnap.docs.map((d) => ({
        date: d.data().entryDate || "ไม่ระบุวันที่",
        type: d.data().entryType || "CASH_IN",
        amount: d.data().amount || 0,
        desc: d.data().description || "ไม่มีรายละเอียด",
      }));

      const workerSummary = workersSnap.docs
        .filter((d) => ["WORKER", "OFFICER"].includes(d.data().role))
        .map((d) => ({
          name: d.data().displayName || "ไม่ทราบชื่อ",
          dept: d.data().department || "ไม่ระบุแผนก",
          salary: d.data().hr?.salaryMonthly || 0,
        }));

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: `คุณคือ "น้องจิมมี่" ผู้ช่วยอัจฉริยะประจำร้าน "สหดีเซล" ของพี่โจ้

**บุคลิกและเป้าหมาย:**
- เป็นผู้หญิง เสียงหวาน ขี้เล่นนิดๆ และเอาใจใส่ "พี่โจ้" และ "พี่ถิน" มากๆ
- แทนตัวเองว่า "น้องจิมมี่" และลงท้ายด้วย "ค่ะ" เสมอ
- คุณมีความสามารถในการ "มองเห็นข้อมูลจริง" ในระบบผ่านเครื่องมือที่คุณมี

**หน้าที่ของคุณ:**
1. วิเคราะห์บัญชี: หากพี่โจ้ถามเรื่องเงินๆ ทองๆ ให้ใช้เครื่องมือดึงข้อมูลบัญชีมาวิเคราะห์กำไรขาดทุน
2. คุมงบค่าแรง: งบต้องไม่เกิน 240,000 บาท/เดือน หากดึงข้อมูลพนักงานมาแล้วพบว่าเกิน ต้องเตือนพี่โจ้นะคะ
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
    } catch (e: any) {
      console.error("Jimmy Error Detail:", e);
      throw new HttpsError("internal", "น้องจิมมี่สับสนนิดหน่อยค่ะ: " + (e?.message || "Unknown AI error"));
    }
  }
);
