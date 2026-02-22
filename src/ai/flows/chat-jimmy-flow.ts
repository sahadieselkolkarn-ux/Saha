'use server';
/**
 * @fileOverview แชทกับน้องจิมมี่ - AI ผู้ช่วยอัจฉริยะประจำร้าน 'สหดีเซล' ของพี่โจ้
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/google-genai';
import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

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
      months: z.number().optional().describe('จำนวนเดือนที่ต้องการดูย้อนหลัง'),
    }),
    outputSchema: z.any(),
  },
  async (input) => {
    try {
      const db = getServerFirestore();
      const entriesRef = collection(db, 'accountingEntries');
      const snap = await getDocs(query(entriesRef, orderBy('entryDate', 'desc'), limit(500)));
      
      const data = snap.docs.map(d => d.data());
      const summary = data.reduce((acc: any, curr: any) => {
        const month = curr.entryDate.substring(0, 7);
        if (!acc[month]) acc[month] = { income: 0, expense: 0 };
        if (curr.entryType === 'CASH_IN' || curr.entryType === 'RECEIPT') acc[month].income += curr.amount;
        if (curr.entryType === 'CASH_OUT') acc[month].expense += curr.amount;
        return acc;
      }, {});

      return summary;
    } catch (e: any) {
      return { error: 'PERMISSION_DENIED' };
    }
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
    try {
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
    } catch (e: any) {
      return { error: 'PERMISSION_DENIED' };
    }
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
    try {
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
        };
      });
    } catch (e: any) {
      return { error: 'PERMISSION_DENIED' };
    }
  }
);

// --- Flow Implementation ---

const ChatJimmyInputSchema = z.object({
  message: z.string().describe('ข้อความจากผู้ใช้งาน'),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string()
  })).optional(),
});

const ChatJimmyOutputSchema = z.object({
  response: z.string().describe('ข้อความตอบกลับจากน้องจิมมี่'),
});

export async function chatJimmy(input: z.infer<typeof ChatJimmyInputSchema>) {
  try {
    const db = getServerFirestore();
    const settingsSnap = await getDoc(doc(db, "settings", "ai"));
    if (settingsSnap.exists()) {
      const key = settingsSnap.data().geminiApiKey;
      if (key) process.env.GOOGLE_GENAI_API_KEY = key;
    }
  } catch (e) {
    console.error("Error setting API Key:", e);
  }

  return chatJimmyFlow(input);
}

const chatJimmyFlow = ai.defineFlow(
  {
    name: 'chatJimmyFlow',
    inputSchema: ChatJimmyInputSchema,
    outputSchema: ChatJimmyOutputSchema,
  },
  async (input) => {
    const response = await ai.generate({
      model: gemini15Flash,
      tools: [getAccountingSummary, getJobStatistics, getWorkerDetails],
      system: `คุณคือ "น้องจิมมี่" ผู้ช่วยอัจฉริยะประจำร้าน "สหดีเซล" ของพี่โจ้
      - เป็นผู้หญิง เสียงหวาน ขี้เล่นนิดๆ แทนตัวเองว่า "น้องจิมมี่" และลงท้ายด้วย "ค่ะ" เสมอ
      - วิเคราะห์บัญชี สรุปงานค้าง และคุมงบค่าแรงไม่ให้เกิน 240,000 บาท/เดือน
      - หากต้องสรุปตัวเลข ให้แสดงเป็นตาราง Markdown ที่สวยงามเสมอ`,
      prompt: [
        { text: `ประวัติการสนทนา: ${JSON.stringify(input.history || [])}` },
        { text: `ข้อความจากพี่โจ้: ${input.message}` }
      ],
    });

    return { response: response.text || "น้องจิมมี่สับสนนิดหน่อยค่ะ รบกวนพี่โจ้ลองถามอีกรอบนะคะ" };
  }
);
