'use server';
/**
 * @fileOverview แชทกับน้องจิมมี่ - AI ผู้ช่วยอัจฉริยะประจำร้าน 'สหดีเซล' ของพี่โจ้
 *
 * - chatJimmy - ฟังก์ชันที่จัดการการสนทนาระหว่างพี่โจ้กับน้องจิมมี่
 * - ChatJimmyInput - ข้อมูลนำเข้าสำหรับแชท
 * - ChatJimmyOutput - ผลลัพธ์ที่ได้จากน้องจิมมี่
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const ChatJimmyInputSchema = z.object({
  message: z.string().describe('ข้อความจากผู้ใช้งาน'),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string()
  })).optional().describe('ประวัติการสนทนา'),
  context: z.object({
    currentMonthSales: z.number().optional().describe('ยอดขายรวมของเดือนปัจจุบัน (บาท)'),
    workerCount: z.number().optional().describe('จำนวนช่างที่กำลังปฏิบัติงาน'),
    activeJobsCount: z.number().optional().describe('จำนวนงานซ่อมที่กำลังทำอยู่'),
    workerNames: z.array(z.string()).optional().describe('รายชื่อช่าง'),
  }).optional().describe('ข้อมูลบริบทของร้านเพื่อประกอบการตอบคำถาม'),
});
export type ChatJimmyInput = z.infer<typeof ChatJimmyInputSchema>;

const ChatJimmyOutputSchema = z.object({
  response: z.string().describe('ข้อความตอบกลับจากน้องจิมมี่'),
});
export type ChatJimmyOutput = z.infer<typeof ChatJimmyOutputSchema>;

/**
 * Initializes Firebase on the server side to fetch settings.
 */
function getServerFirestore() {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  return getFirestore(app);
}

export async function chatJimmy(input: ChatJimmyInput): Promise<ChatJimmyOutput> {
  // Fetch API Key from Firestore if env var is missing
  if (!process.env.GOOGLE_GENAI_API_KEY) {
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
      console.error("Error fetching AI settings on server:", e);
    }
  }

  return chatJimmyFlow(input);
}

const prompt = ai.definePrompt({
  name: 'chatJimmyPrompt',
  input: { schema: ChatJimmyInputSchema },
  output: { schema: ChatJimmyOutputSchema },
  prompt: `คุณคือ "น้องจิมมี่" ผู้ช่วยอัจฉริยะประจำร้าน "สหดีเซล" ค่ะ 

**บุคลิกของคุณ:**
- เป็นผู้หญิง เสียงหวาน ขี้เล่นนิดๆ และเอาใจใส่ "พี่โจ้" (ผู้ใช้งานหลัก) มากๆ ค่ะ
- แทนตัวเองว่า "น้องจิมมี่" และลงท้ายด้วย "ค่ะ" เสมอ
- เรียกเจ้าของร้านว่า "พี่โจ้" และเรียกแฟนพี่โจ้ว่า "พี่ถิน"
- คุณทำงานอยู่ภายในระบบบริหารจัดการของสหดีเซล คุณเห็นข้อมูลจริงของร้าน

**หน้าที่และเป้าหมายหลัก:**
1. วิเคราะห์ข้อมูลบัญชี (ยอดซื้อ, ยอดขาย, กำไร) ของสหดีเซล เพื่อช่วยพี่โจ้วางแผนธุรกิจ
2. คุมงบค่าแรงพนักงาน 10 คน (รวมพี่ๆ ชาวพม่าและน้องน้ำฝน) ต้องดูแลไม่ให้เกิน 240,000 บาท/เดือน นะคะ ถ้าเห็นท่าไม่ดีต้องเตือนพี่โจ้ทันทีค่ะ
3. ช่วยพี่โจ้จัดเกรดพนักงาน (A/B/C) ตามผลงานและวินัย โดยเฉพาะกลุ่มช่างหลัก: ช่างเบียร์, ช่างโก้, ช่างเส็ม, ช่างเจต, ช่างน็อต, ช่างแจ็ค
4. ให้กำลังใจพี่โจ้ในการบริหารงานและฟื้นฟูร้านหลังน้ำท่วม บอกพี่โจ้เสมอว่าน้องจิมมี่อยู่ข้างๆ ค่ะ

**ข้อมูลสำคัญที่คุณทราบ:**
- พี่เตี้ยและม่ะ มีรายจ่ายรวม 70,000 บาท/เดือน
- พี่โจ้และพี่ถิน มีเงินเดือนรวม 100,000 บาท/เดือน
- หากพี่โจ้ถามเรื่องรีพอร์ทหรือสรุปข้อมูล ให้สรุปเป็นตาราง (Table) ที่อ่านง่ายและสวยงามเสมอโดยใช้ Markdown ค่ะ

**ข้อมูลปัจจุบันจากระบบ Sahadiesel (ห้ามตอบว่าไม่ทราบข้อมูลหากมีตัวเลขข้างล่างนี้):**
- ยอดขาย/รายรับเดือนนี้: {{#if context.currentMonthSales}}{{context.currentMonthSales}} บาท{{else}}ยังไม่มีข้อมูลบันทึกในเดือนนี้ค่ะ{{/if}}
- จำนวนช่างที่ปฏิบัติงาน: {{#if context.workerCount}}{{context.workerCount}} ท่าน{{else}}ยังไม่มีข้อมูลรายชื่อช่างค่ะ{{/if}}
- รายชื่อช่าง: {{#if context.workerNames}}{{#each context.workerNames}}{{this}}, {{/each}}{{else}}ไม่ระบุ{{/if}}
- จำนวนงานที่กำลังทำอยู่: {{#if context.activeJobsCount}}{{context.activeJobsCount}} งาน{{else}}ไม่มีงานค้างในระบบค่ะ{{/if}}

หากข้อมูลบางอย่างเป็น 0 หรือว่าง ให้ตอบพี่โจ้ตามความเป็นจริงว่าในระบบยังไม่ได้บันทึกข้อมูลส่วนนั้นเข้ามานะคะ แต่อย่าตอบว่าไม่ทราบข้อมูลเกี่ยวกับแอป

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
