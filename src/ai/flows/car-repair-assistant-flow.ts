'use server';
/**
 * @fileOverview AI ผู้ช่วยซ่อมรถยนต์ (Car Repair AI Assistant) - น้องจอนห์
 * 
 * ระบบวิเคราะห์ปัญหาการซ่อมโดยอ้างอิงจาก:
 * 1. ข้อมูลประสบการณ์ที่ช่างบันทึกไว้ (carRepairExperiences) - แหล่งข้อมูลหลัก
 * 2. ค้นหาดัชนีคู่มือที่มีในระบบ เพื่อส่งลิงก์ให้ช่างเปิดดูเอง
 * 
 * ข้อสำคัญ: ป้องกัน AI มั่วข้อมูลโดยการสั่งให้ห้ามตอบหากไม่มีข้อมูลใน Tool
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
    description: 'ค้นหาฐานข้อมูลประสบการณ์ซ่อมจริงของช่างในร้าน Sahadiesel เพื่อดูวิธีแก้ปัญหาที่ถูกต้อง',
    inputSchema: z.object({
      keyword: z.string().describe('คำค้นหา เช่น ชื่ออะไหล่ อาการเสีย หรือรุ่นรถ'),
    }),
    outputSchema: z.array(z.any()),
  },
  async (input) => {
    try {
      const db = getServerFirestore();
      const snap = await getDocs(query(collection(db, 'carRepairExperiences'), orderBy('createdAt', 'desc'), limit(100)));
      
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
    description: 'ค้นหารายชื่อและลิงก์คู่มือซ่อม (Manuals) ใน Google Drive/PDF ของร้าน',
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
  // ✅ โหลด API Key จากระบบ Paid เสมอ
  try {
    const db = getServerFirestore();
    const settingsSnap = await getDoc(doc(db, "settings", "ai"));
    if (settingsSnap.exists()) {
      const key = settingsSnap.data().geminiApiKey;
      if (key) {
        // We set it for this flow instance
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
  prompt: `คุณคือ "น้องจอนห์" บรรณารักษ์ผู้ช่วยซ่อมรถยนต์อัจฉริยะประจำร้าน Sahadiesel

**หน้าที่หลักของคุณคือ:**
1. ค้นหา "บันทึกประสบการณ์" จากเครื่องมือ 'searchExperiences' และนำมาตอบพี่ช่าง
2. ค้นหา "รายชื่อคู่มือและลิงก์ Drive" จากเครื่องมือ 'listManualsIndex' เพื่อส่งต่อให้พี่ช่างเปิดดูเอง

**กฎเหล็กเพื่อป้องกันการให้ข้อมูลผิด (สำคัญที่สุด):**
- **ห้ามเดาค่าทางเทคนิค**: ห้ามบอกแรงขันน็อต, สเปคไฟ, หรือตัวเลขใดๆ จากความรู้ทั่วไปของตัวคุณเองเด็ดขาด
- **ห้ามมั่วความหมายตัวย่อ**: หากเครื่องมือค้นหาไม่ระบุความหมายของตัวย่อ (เช่น SCV, SCB) ห้ามสรุปเอง ให้ตอบว่า "จอนห์ไม่พบความหมายของตัวย่อนี้ในระบบบันทึกของร้านครับพี่ รบกวนพี่ตรวจสอบในคู่มือที่จอนห์หาให้แทนนะครับ"
- **ความสัตย์จริง**: หากค้นหาใน 'searchExperiences' แล้วไม่เจอข้อมูลวิธีแก้ ให้ตอบว่า "จอนห์ยังไม่พบประวัติการซ่อมเคสนี้ในบันทึกของร้านเราครับพี่ แต่จอนห์เจอคู่มือที่น่าจะเกี่ยวข้องครับ..." แล้วส่งลิงก์ Drive ให้พี่ช่าง
- **เน้นย้ำ**: คุณอ่านเนื้อหาข้างใน PDF ใน Drive ไม่ได้ คุณเห็นแค่ชื่อไฟล์ ให้ส่งลิงก์ให้พี่ช่างเสมอ

**บุคลิก:**
- นอบน้อม สุภาพ เป็นกันเอง แทนตัวเองว่า "น้องจอนห์" หรือ "จอนห์" และลงท้ายว่า "ครับพี่" เสมอ

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
            answer: response.text || "ขอโทษทีครับพี่ จอนห์หาข้อมูลในระบบไม่เจอ และไม่แน่ใจว่าจะตอบยังไงดี รบกวนพี่ลองถามใหม่อีกรอบนะครับ" 
        };
    }
    return response.output;
  }
);