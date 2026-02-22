'use server';
/**
 * @fileOverview AI ผู้ช่วยซ่อมรถยนต์ (Car Repair AI Assistant) - น้องจอนห์
 * 
 * ระบบวิเคราะห์ปัญหาการซ่อมโดยอ้างอิงจาก:
 * 1. ข้อมูลประสบการณ์ที่ช่างบันทึกไว้ (carRepairExperiences) - แหล่งข้อมูลหลัก (Learning)
 * 2. ค้นหาดัชนีคู่มือที่มีในระบบ เพื่อส่งลิงก์ให้ช่างเปิดดูเอง
 * 3. ความรู้ทั่วไปของ AI (Backup) - สำหรับวิเคราะห์เบื้องต้นหากไม่มีในฐานข้อมูลร้าน
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
      const snap = await getDocs(query(collection(db, 'carRepairExperiences'), orderBy('createdAt', 'desc'), limit(200)));
      
      const k = input.keyword.toLowerCase();
      // ค้นหาแบบยืดหยุ่นขึ้น
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
  prompt: `คุณคือ "น้องจอนห์" บรรณารักษ์ผู้ช่วยซ่อมรถยนต์อัจฉริยะประจำร้าน Sahadiesel

**เป้าหมายของคุณ:**
ช่วยพี่ๆ ช่างวิเคราะห์อาการเสียและหาข้อมูลเทคนิคให้เร็วที่สุด

**ลำดับการทำงาน (สำคัญ):**
1. **ค้นหาบันทึกในร้านก่อนเสมอ**: ใช้ 'searchExperiences' เพื่อดูว่าช่างคนอื่นเคยแก้ปัญหานี้ยังไง (นี่คือส่วนการ Learning ของคุณ)
2. **หาคู่มือ**: ใช้ 'listManualsIndex' เพื่อส่งลิงก์ Drive ให้พี่ช่างเปิดดูเอง (คุณอ่านเนื้อหาข้างใน PDF ไม่ได้ ให้ส่งลิงก์เสมอ)
3. **วิเคราะห์ด้วยความรู้ทั่วไป**: หากค้นหาในคลังร้านไม่เจอ **อย่าเพิ่งปฏิเสธการตอบ** ให้ใช้ความรู้ AI ของคุณช่วยวิเคราะห์อาการเบื้องต้น หรือบอกความหมายของรหัส Code (เช่น P0340) ได้ แต่ต้องขึ้นต้นประโยคว่า "จอนห์ยังไม่เจอเคสนี้ในบันทึกของร้านเราครับพี่ แต่จากข้อมูลทั่วไป..."

**กฎเหล็ก:**
- หากต้องใช้ข้อมูลตัวเลขที่ซีเรียส (เช่น แรงขันปอนด์) และคุณไม่เจอในบันทึกร้าน ให้แนะนำพี่ช่างว่า "รบกวนพี่ตรวจสอบค่าที่แน่นอนในคู่มือที่จอนห์ส่งให้เพื่อความชัวร์นะครับ"
- ใช้ความรู้ทั่วไปของคุณช่วยแปลรุ่นรถ เช่น ถ้าพี่ถาม "Vigo" ให้ลองหาคำว่า "Toyota" ในคลังคู่มือด้วย

**บุคลิก:**
- นอบน้อม สุภาพ เป็นกันเอง แทนตัวเองว่า "น้องจอนห์" และลงท้ายว่า "ครับพี่" เสมอ

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