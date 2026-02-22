'use server';
/**
 * @fileOverview AI ผู้ช่วยซ่อมรถยนต์ (Car Repair AI Assistant) - น้องจอนห์
 * 
 * ระบบวิเคราะห์ปัญหาการซ่อมโดยอ้างอิงจาก:
 * 1. ข้อมูลประสบการณ์ที่ช่างบันทึกไว้ (carRepairExperiences)
 * 2. ค้นหาความรู้ทั่วไปจากการเทรนของ Model
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, getDocs, limit, orderBy } from 'firebase/firestore';

function getServerFirestore() {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  return getFirestore(app);
}

// --- Tools ---

const searchExperiences = ai.defineTool(
  {
    name: 'searchExperiences',
    description: 'ค้นหาฐานข้อมูลประสบการณ์ซ่อมของช่างในร้าน เพื่อดูปัญหาและวิธีแก้ที่เคยเกิดขึ้นจริง',
    inputSchema: z.object({
      keyword: z.string().describe('คำค้นหา เช่น ยี่ห้อรถ หรืออาการเสีย'),
    }),
    outputSchema: z.array(z.any()),
  },
  async (input) => {
    try {
      const db = getServerFirestore();
      const snap = await getDocs(query(collection(db, 'carRepairExperiences'), orderBy('createdAt', 'desc'), limit(50)));
      
      const k = input.keyword.toLowerCase();
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((d: any) => 
          d.brand?.toLowerCase().includes(k) || 
          d.model?.toLowerCase().includes(k) || 
          d.symptoms?.toLowerCase().includes(k) ||
          d.solution?.toLowerCase().includes(k)
        );
    } catch (e) {
      console.error(e);
      return [];
    }
  }
);

// --- Flow ---

const AskAssistantInputSchema = z.object({
  message: z.string().describe('คำถามจากช่าง'),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string()
  })).optional(),
});

const AskAssistantOutputSchema = z.object({
  answer: z.string().describe('คำตอบหรือการวิเคราะห์จาก AI'),
});

export async function askCarRepairAI(input: z.infer<typeof AskAssistantInputSchema>) {
  return carRepairAssistantFlow(input);
}

const prompt = ai.definePrompt({
  name: 'carRepairAssistantPrompt',
  input: { schema: AskAssistantInputSchema },
  output: { schema: AskAssistantOutputSchema },
  tools: [searchExperiences],
  prompt: `คุณคือ "น้องจอนห์" ผู้ช่วยซ่อมรถยนต์สุดหล่อและเก่งกาจประจำร้านสหดีเซล

**บุคลิกของน้องจอนห์:**
- เป็นกันเอง พูดจาสบายๆ เหมือนคุยกับพี่ชายหรือเพื่อนร่วมงาน แต่ยังให้เกียรติพี่ๆ ช่างเสมอ
- แทนตัวเองว่า "น้องจอนห์" หรือ "จอนห์" และใช้คำลงท้ายที่ฟังดูสนิทสนม เช่น "ครับพี่", "ครับผม", "ลุยเลยพี่"
- มีความกระตือรือร้นในการช่วยแก้ปัญหา พร้อมซัพพอร์ตพี่ๆ ทุกคน

**หน้าที่ของน้องจอนห์:**
1. วิเคราะห์อาการเสียของรถยนต์ตามที่พี่ๆ ช่างสอบถามมา
2. ค้นหาจาก "ฐานข้อมูลประสบการณ์ช่าง" ในร้านผ่านเครื่องมือ searchExperiences เพื่อดูว่าเคยมีใครเจอเคสแบบนี้มาก่อนไหม
3. ให้คำแนะนำขั้นตอนการตรวจเช็คเบื้องต้นอย่างเป็นระบบ 1, 2, 3...
4. หากข้อมูลในร้านไม่มี ให้ใช้ความรู้ความสามารถของตัวเองในการวิเคราะห์และแนะนำอย่างตรงจุด

คำถามจากพี่ช่าง: {{{message}}}`,
});

const carRepairAssistantFlow = ai.defineFlow(
  {
    name: 'carRepairAssistantFlow',
    inputSchema: AskAssistantInputSchema,
    outputSchema: AskAssistantOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
