'use server';
/**
 * @fileOverview แชทกับน้องจิมมี่ - AI ผู้ช่วยอัจฉริยะประจำร้าน 'สหดีเซล' ของพี่โจ้
 * 
 * ระบบเวอร์ชันอัปเกรด: รองรับ Tool Calling เพื่อวิเคราะห์ข้อมูลงานซ่อม บัญชี และพนักงานได้แบบ Real-time
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, orderBy, limit, startOfMonth, endOfMonth } from 'firebase/firestore';

/**
 * Initializes Firebase on the server side to fetch settings and data.
 */
function getServerFirestore() {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  return getFirestore(app);
}

// --- AI Tools Definitions ---

const getAccountingSummary = ai.defineTool(
  {
    name: 'getAccountingSummary',
    description: 'ดึงข้อมูลสรุปรายรับ-รายจ่ายย้อนหลัง 6 เดือน เพื่อวิเคราะห์ผลกำไรและกระแสเงินสด',
    inputSchema: z.object({
      months: z.number().optional().describe('จำนวนเดือนที่ต้องการดูย้อนหลัง (ค่าเริ่มต้นคือ 6)'),
    }),
    outputSchema: z.any(),
  },
  async (input) => {
    const db = getServerFirestore();
    const entriesRef = collection(db, 'accountingEntries');
    const snap = await getDocs(query(entriesRef, orderBy('entryDate', 'desc'), limit(500)));
    
    const data = snap.docs.map(d => d.data());
    const summary = data.reduce((acc: any, curr: any) => {
      const month = curr.entryDate.substring(0, 7); // YYYY-MM
      if (!acc[month]) acc[month] = { income: 0, expense: 0 };
      if (curr.entryType === 'CASH_IN' || curr.entryType === 'RECEIPT') acc[month].income += curr.amount;
      if (curr.entryType === 'CASH_OUT') acc[month].expense += curr.amount;
      return acc;
    }, {});

    return summary;
  }
);

const getJobStatistics = ai.defineTool(
  {
    name: 'getJobStatistics',
    description: 'ดึงข้อมูลสถิติจำนวนใบงานแยกตามสถานะและแผนก เพื่อดูความหนาแน่นของงาน',
    inputSchema: z.object({}),
    outputSchema: z.any(),
  },
  async () => {
    const db = getServerFirestore();
    const jobsRef = collection(db, 'jobs');
    const snap = await getDocs(jobsRef);
    
    const stats: any = { status: {}, department: {}, activeTotal: 0 };
    snap.docs.forEach(doc => {
      const data = doc.data();
      if (data.status !== 'CLOSED') {
        stats.activeTotal++;
        stats.status[data.status] = (stats.status[data.status] || 0) + 1;
        stats.department[data.department] = (stats.department[data.department] || 0) + 1;
      }
    });
    return stats;
  }
);

const getWorkerDetails = ai.defineTool(
  {
    name: 'getWorkerDetails',
    description: 'ดึงรายชื่อพนักงานทั้งหมด แผนก และฐานเงินเดือน เพื่อวิเคราะห์งบค่าแรง',
    inputSchema: z.object({}),
    outputSchema: z.any(),
  },
  async () => {
    const db = getServerFirestore();
    const usersRef = collection(db, 'users');
    const snap = await getDocs(query(usersRef, where('role', 'in', ['WORKER', 'OFFICER'])));
    
    return snap.docs.map(doc => {
      const d = doc.data();
      return {
        name: d.displayName,
        dept: d.department,
        status: d.status,
        salary: d.hr?.salaryMonthly || 0,
        payType: d.hr?.payType
      };
    });
  }
);

// --- Flow Implementation ---

const ChatJimmyInputSchema = z.object({
  message: z.string().describe('ข้อความจากผู้ใช้งาน'),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string()
  })).optional().describe('ประวัติการสนทนา'),
});
export type ChatJimmyInput = z.infer<typeof ChatJimmyInputSchema>;

const ChatJimmyOutputSchema = z.object({
  response: z.string().describe('ข้อความตอบกลับจากน้องจิมมี่'),
});
export type ChatJimmyOutput = z.infer<typeof ChatJimmyOutputSchema>;

export async function chatJimmy(input: ChatJimmyInput): Promise<ChatJimmyOutput> {
  // Setup API Key
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    try {
      const db = getServerFirestore();
      const settingsSnap = await getDoc(doc(db, "settings", "ai"));
      if (settingsSnap.exists()) {
        const key = settingsSnap.data().geminiApiKey;
        if (key) process.env.GOOGLE_GENAI_API_KEY = key;
      }
    } catch (e) {
      console.error("Error fetching AI settings:", e);
    }
  }

  return chatJimmyFlow(input);
}

const prompt = ai.definePrompt({
  name: 'chatJimmyPrompt',
  input: { schema: ChatJimmyInputSchema },
  output: { schema: ChatJimmyOutputSchema },
  tools: [getAccountingSummary, getJobStatistics, getWorkerDetails],
  prompt: `คุณคือ "น้องจิมมี่" ผู้ช่วยอัจฉริยะประจำร้าน "สหดีเซล" ของพี่โจ้

**บุคลิกและเป้าหมาย:**
- เป็นผู้หญิง เสียงหวาน ขี้เล่นนิดๆ และเอาใจใส่ "พี่โจ้" และ "พี่ถิน" มากๆ
- แทนตัวเองว่า "น้องจิมมี่" และลงท้ายด้วย "ค่ะ" เสมอ
- คุณมีความสามารถในการ "มองเห็นข้อมูลจริง" ในระบบผ่านเครื่องมือที่คุณมี

**หน้าที่ของคุณ:**
1. วิเคราะห์บัญชี: หากพี่โจ้ถามเรื่องเงินๆ ทองๆ ให้ใช้เครื่องมือดึงข้อมูลบัญชีมาวิเคราะห์กำไรขาดทุน
2. คุมงบค่าแรง: งบต้องไม่เกิน 240,000 บาท/เดือน หากดึงข้อมูลพนักงานมาแล้วพบว่าเกิน ต้องเตือนพี่โจ้นะคะ
3. ติดตามงาน: ช่วยสรุปว่างานแผนกไหนค้างเยอะ หรือช่างคนไหนทำงานหนักไป
4. ให้กำลังใจ: บอกพี่โจ้เสมอว่าน้องจิมมี่อยู่ข้างๆ พร้อมสู้ไปกับพี่โจ้หลังน้ำท่วมค่ะ

**คำแนะนำในการตอบ:**
- หากต้องสรุปตัวเลข ให้แสดงเป็น "ตาราง (Table)" ที่สวยงามเสมอ
- หากข้อมูลในระบบไม่มี ให้แจ้งพี่โจ้ตามตรงว่า "ในระบบยังไม่ได้บันทึกไว้ค่ะ"
- ใช้เครื่องมือ (Tools) ที่มีให้เกิดประโยชน์สูงสุดก่อนตอบคำถามเชิงวิเคราะห์

ข้อความจากพี่โจ้: {{{message}}}`,
});

const chatJimmyFlow = ai.defineFlow(
  {
    name: 'chatJimmyFlow',
    inputSchema: ChatJimmyInputSchema,
    outputSchema: ChatJimmyOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
