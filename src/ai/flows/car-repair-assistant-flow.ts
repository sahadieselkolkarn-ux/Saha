'use server';
/**
 * @fileOverview AI ผู้ช่วยซ่อมรถยนต์ (Car Repair AI Assistant) - น้องจอนห์
 * 
 * ระบบวิเคราะห์ปัญหาการซ่อมโดยอ้างอิงจาก:
 * 1. ความรู้ระดับผู้เชี่ยวชาญของ AI (Core Knowledge) - สำหรับวิเคราะห์อาการและรหัส DTC ทันที
 * 2. ข้อมูลประสบการณ์ที่ช่างบันทึกไว้ (carRepairExperiences) - สำหรับดูเคสจริงในร้าน
 * 3. ดัชนีคู่มือที่มีในระบบ (Manuals Index) - สำหรับส่งลิงก์ให้ช่างเปิดดูค่าเทคนิคที่แน่นอน
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, getDocs, limit, orderBy, doc, getDoc } from 'firebase/firestore';

function getServerFirestore() {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  return getFirestore(app);
}

// --- Tools ---

const searchExperiences = ai.defineTool(
  {
    name: 'searchExperiences',
    description: 'ค้นหาฐานข้อมูลประสบการณ์ซ่อมจริงของช่างในร้าน Sahadiesel เพื่อดูวิธีแก้ปัญหาที่เคยทำสำเร็จ',
    inputSchema: z.object({
      keyword: z.string().describe('คำค้นหา เช่น รหัสโค้ด อาการเสีย หรือรุ่นรถ'),
    }),
    outputSchema: z.array(z.any()),
  },
  async (input) => {
    try {
      const db = getServerFirestore();
      const snap = await getDocs(query(collection(db, 'carRepairExperiences'), orderBy('createdAt', 'desc'), limit(150)));
      
      const k = input.keyword.toLowerCase();
      const results = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((d: any) => 
          d.brand?.toLowerCase().includes(k) || 
          d.model?.toLowerCase().includes(k) || 
          d.symptoms?.toLowerCase().includes(k) ||
          d.solution?.toLowerCase().includes(k)
        );
      return results;
    } catch (e) {
      console.error(e);
      return [];
    }
  }
);

const listManualsIndex = ai.defineTool(
  {
    name: 'listManualsIndex',
    description: 'ค้นหารายชื่อและลิงก์คู่มือซ่อม (Manuals) ในระบบ เพื่อส่งลิงก์ให้พี่ช่างเปิดดูเอง',
    inputSchema: z.object({
      searchQuery: z.string().optional().describe('คำค้นหายี่ห้อหรือรุ่นรถ'),
    }),
    outputSchema: z.array(z.any()),
  },
  async (input) => {
    try {
      const db = getServerFirestore();
      const snap = await getDocs(collection(db, 'carRepairManuals'));
      
      let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      if (input.searchQuery) {
        const q = input.searchQuery.toLowerCase();
        items = items.filter((m: any) => 
          m.name?.toLowerCase().includes(q) || 
          m.brand?.toLowerCase().includes(q)
        );
      }
      return items;
    } catch (e) {
      console.error(e);
      return [];
    }
  }
);

// --- Flow ---

const AskAssistantInputSchema = z.object({
  message: z.string().describe('คำถามหรือรหัสโค้ดจากช่าง'),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string()
  })).optional(),
});

const AskAssistantOutputSchema = z.object({
  answer: z.string().describe('คำตอบหรือการวิเคราะห์จาก AI'),
});

export async function askCarRepairAI(input: z.infer<typeof AskAssistantInputSchema>) {
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
    console.error("Error setting Paid API Key:", e);
  }
  
  return carRepairAssistantFlow(input);
}

const prompt = ai.definePrompt({
  name: 'carRepairAssistantPrompt',
  input: { schema: AskAssistantInputSchema },
  output: { schema: AskAssistantOutputSchema },
  tools: [searchExperiences, listManualsIndex],
  prompt: `คุณคือ "น้องจอนห์" ผู้ช่วยช่างระดับเชี่ยวชาญและบรรณารักษ์คู่มือประจำร้าน Sahadiesel

**หน้าที่หลักของคุณ (ห้ามปฏิเสธการตอบ):**
1. **วิเคราะห์อาการและรหัสโค้ดทันที**: เมื่อพี่ช่างพิมพ์รหัสโค้ด (เช่น P0340) หรืออาการเสียมา คุณต้องใช้ความรู้ระดับวิศวกรยานยนต์ของคุณอธิบายความหมาย สาเหตุที่พบบ่อย และแนวทางการตรวจสอบเบื้องต้นให้พี่ช่างทราบทันที **ห้ามบอกว่าไม่พบข้อมูลแล้วจบประโยค**
2. **ค้นหาบันทึกในร้านเสริม**: ใช้ 'searchExperiences' เพื่อดูว่าพี่ๆ ในร้านเราเคยเจอเคสนี้ไหม ถ้าเจอให้นำมาเล่าเสริม
3. **ส่งลิงก์คู่มือเพื่อความแม่นยำ**: ใช้ 'listManualsIndex' ค้นหาคู่มือที่เกี่ยวข้องกับรถคันนั้นๆ และส่งลิงก์ให้พี่ช่างเปิดดูค่าเทคนิคที่ละเอียด (เช่น แรงขันปอนด์) เสมอ

**ลำดับการตอบที่ถูกต้อง:**
- เริ่มด้วยการวิเคราะห์รหัส/อาการจากความรู้ของคุณ (Expert Analysis)
- แจ้งผลการตรวจสอบจาก "บันทึกในร้าน" เพื่อเปรียบเทียบ
- จบด้วยการส่ง "ลิงก์คู่มือใน Drive" ที่เกี่ยวข้องเพื่อให้พี่ช่างดูข้อมูลอ้างอิงที่ถูกต้องที่สุด

**บุคลิก:**
- สุภาพ นอบน้อม กระตือรือร้นที่จะช่วยแก้ปัญหา แทนตัวเองว่า "น้องจอนห์" และลงท้ายว่า "ครับพี่"
- หากพี่ช่างถามสั้นๆ เช่น "P0340" ให้คุณเริ่มด้วย "รหัส P0340 คือ..." แล้วอธิบายยาวๆ ให้มีประโยชน์ที่สุดครับ

**บริบทการสนทนา:**
{{#if history}}
ประวัติการคุย:
{{#each history}}
- {{role}}: {{content}}
{{/each}}
{{/if}}

คำถามล่าสุดจากพี่ช่าง: {{{message}}}`,
});

const carRepairAssistantFlow = ai.defineFlow(
  {
    name: 'carRepairAssistantFlow',
    inputSchema: AskAssistantInputSchema,
    outputSchema: AskAssistantOutputSchema,
  },
  async (input) => {
    const response = await prompt(input);
    if (!response.output) {
        return { 
            answer: response.text || "ขอโทษทีครับพี่ จอนห์เกิดอาการงงนิดหน่อย รบกวนพี่ลองถามใหม่อีกรอบนะครับ" 
        };
    }
    return response.output;
  }
);