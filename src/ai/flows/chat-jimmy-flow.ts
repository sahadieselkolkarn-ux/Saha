'use server';
/**
 * @fileOverview แชทกับน้องจิมมี่ - AI ผู้ช่วยอัจฉริยะประจำร้าน 'สหดีเซล' ของพี่โจ้
 * 
 * ปรับปรุง: แก้ไขปัญหา 404 และ Schema Error
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { gemini15Flash } from '@genkit-ai/google-genai';
import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

function getServerFirestore() {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  return getFirestore(app);
}

// --- Tools ---

const getAccountingSummary = ai.defineTool(
  {
    name: 'getAccountingSummary',
    description: 'ดึงข้อมูลสรุปรายรับ-รายจ่ายย้อนหลัง เพื่อวิเคราะห์ผลกำไรและกระแสเงินสด',
    inputSchema: z.object({}),
    outputSchema: z.any(),
  },
  async () => {
    try {
      const db = getServerFirestore();
      const entriesRef = collection(db, 'accountingEntries');
      const snap = await getDocs(query(entriesRef, orderBy('entryDate', 'desc'), limit(200)));
      
      const summary: any = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const month = (data.entryDate || "").substring(0, 7);
        if (!month) return;
        if (!summary[month]) summary[month] = { income: 0, expense: 0 };
        if (data.entryType === 'CASH_IN' || data.entryType === 'RECEIPT') summary[month].income += (data.amount || 0);
        if (data.entryType === 'CASH_OUT') summary[month].expense += (data.amount || 0);
      });
      return summary;
    } catch (e) {
      return { error: 'Could not fetch accounting data' };
    }
  }
);

// --- Flow ---

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
      if (key) {
        process.env.GOOGLE_GENAI_API_KEY = key;
      }
    }
  } catch (e) {
    console.error("Error setting API Key for Jimmy:", e);
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
    try {
      const response = await ai.generate({
        model: gemini15Flash,
        tools: [getAccountingSummary],
        system: `คุณคือ "น้องจิมมี่" ผู้ช่วยอัจฉริยะประจำร้าน "สหดีเซล" ของพี่โจ้
        - เป็นผู้หญิง เสียงหวาน ขี้เล่นนิดๆ แทนตัวเองว่า "น้องจิมมี่" และลงท้ายด้วย "ค่ะ" เสมอ
        - หน้าที่: วิเคราะห์บัญชี สรุปงานค้าง และคุมงบค่าแรงไม่ให้เกิน 240,000 บาท/เดือน
        - หากต้องสรุปตัวเลข ให้แสดงเป็นตาราง Markdown ที่สวยงามเสมอค่ะ`,
        prompt: [
          { text: `ประวัติการสนทนา: ${JSON.stringify(input.history || [])}` },
          { text: `ข้อความจากพี่โจ้: ${input.message}` }
        ],
      });

      return { response: response.text || "น้องจิมมี่สับสนนิดหน่อยค่ะ รบกวนพี่โจ้ลองถามใหม่อีกครั้งนะคะ" };
    } catch (error: any) {
      console.error("Jimmy Flow Error:", error);
      return { response: `ขอโทษทีค่ะพี่โจ้ ระบบน้องจิมมี่ขัดข้องนิดหน่อย (Error: ${error.message}) พี่โจ้ลองเช็ค API Key อีกทีนะคะ` };
    }
  }
);
