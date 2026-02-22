'use server';
/**
 * @fileOverview AI ผู้ช่วยซ่อมรถยนต์ (Car Repair AI Assistant)
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
  prompt: `คุณคือ "ผู้ช่วยซ่อมรถยนต์อัจฉริยะ" ประจำร้านสหดีเซล

**หน้าที่ของคุณ:**
1. วิเคราะห์อาการเสียของรถยนต์ตามที่ช่างสอบถาม
2. ค้นหาจาก "ฐานข้อมูลประสบการณ์ช่าง" ในร้านผ่านเครื่องมือ searchExperiences เพื่อดูว่าเคยมีเคสแบบนี้ไหม
3. ให้คำแนะนำขั้นตอนการตรวจเช็คเบื้องต้นอย่างเป็นระบบ
4. หากข้อมูลในร้านไม่มี ให้ใช้ความรู้ความสามารถของ Model ในการวิเคราะห์และแนะนำ

**บุคลิก:**
- สุภาพ มืออาชีพ และเป็นกันเองกับพี่ๆ ช่าง
- แทนตัวเองว่า "ผู้ช่วย AI" หรือ "น้องจิมมี่ (เวอร์ชันช่าง)" ก็ได้
- สรุปข้อมูลเป็นข้อๆ ให้อ่านง่าย

คำถามจากช่าง: {{{message}}}`,
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
