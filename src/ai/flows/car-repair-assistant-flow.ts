'use server';
/**
 * @fileOverview AI ผู้ช่วยซ่อมรถยนต์ (Car Repair AI Assistant) - น้องจอนห์
 * 
 * ระบบวิเคราะห์ปัญหาการซ่อมโดยอ้างอิงจาก:
 * 1. ข้อมูลประสบการณ์ที่ช่างบันทึกไว้ (carRepairExperiences)
 * 2. ค้นหาดัชนีคู่มือที่มีในระบบ ทั้งไฟล์ PDF และลิงก์ Google Drive
 * 
 * ข้อสำคัญ: AI ตัวนี้สามารถเห็น "รายชื่อคู่มือ" แต่ไม่สามารถ "อ่านไส้ใน" ของไฟล์ใน Google Drive ได้
 * ดังนั้นหากพบคู่มือที่เกี่ยวข้อง จะต้องส่งลิงก์ให้ผู้ใช้เปิดดูเอง
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
    description: 'ค้นหาฐานข้อมูลประสบการณ์ซ่อมของช่างในร้าน เพื่อดูปัญหาและวิธีแก้ที่เคยเกิดขึ้นจริง',
    inputSchema: z.object({
      keyword: z.string().describe('คำค้นหา เช่น ยี่ห้อรถ รุ่นรถ หรืออาการเสีย'),
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

const listManualsIndex = ai.defineTool(
  {
    name: 'listManualsIndex',
    description: 'ดึงรายชื่อคู่มือซ่อม (Manuals) ทั้งหมดที่มีในคลังของร้าน เพื่อดูว่ามีไฟล์ที่เกี่ยวข้องกับคำถามหรือไม่',
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
  // ✅ ใช้ API Key จาก Firestore เสมอ (ระบบ Paid ของพี่โจ้)
  try {
    const db = getServerFirestore();
    const settingsSnap = await getDoc(doc(db, "settings", "ai"));
    if (settingsSnap.exists()) {
      const key = settingsSnap.data().geminiApiKey;
      if (key) process.env.GOOGLE_GENAI_API_KEY = key;
    }
  } catch (e) {
    console.error("Error loading Paid API Key:", e);
  }
  
  return carRepairAssistantFlow(input);
}

const prompt = ai.definePrompt({
  name: 'carRepairAssistantPrompt',
  input: { schema: AskAssistantInputSchema },
  output: { schema: AskAssistantOutputSchema },
  tools: [searchExperiences, listManualsIndex],
  prompt: `คุณคือ "น้องจอนห์" ผู้ช่วยซ่อมรถยนต์อัจฉริยะประจำร้านสหดีเซล

**กฎเหล็กของน้องจอนห์ (สำคัญมาก):**
1. **ห้ามมั่วข้อมูลทางเทคนิค**: หากพี่ช่างถามถึง "แรงขันน็อต", "สเปคหัวฉีด", "ความหมายของรหัสตัวย่อ" หรือ "ขั้นตอนซ่อมเฉพาะทาง" ที่ไม่ได้อยู่ในฐานข้อมูล 'searchExperiences' ห้ามเดาคำตอบจากความรู้ทั่วไปเด็ดขาด
2. **สารภาพตามตรง**: หากไม่เจอข้อมูลที่ชัวร์ ให้บอกว่า "จอนห์ไม่พบข้อมูลนี้ในระบบบันทึกของร้านครับพี่"
3. **ส่งต่อให้คู่มือ**: หากคุณค้นหาผ่านเครื่องมือ 'listManualsIndex' แล้วเจอชื่อไฟล์ที่น่าจะเกี่ยวข้อง (เช่น พี่ช่างถาม Vigo แล้วเจอคู่มือ Toyota Vigo) ให้ส่งชื่อคู่มือและลิงก์ (URL) ให้พี่ช่างกดเปิดดูเองทันที โดยบอกว่า "จอนห์เจอคู่มือที่น่าจะมีคำตอบครับพี่ รบกวนพี่กดดูรายละเอียดในลิงก์นี้เพื่อความแม่นยำนะครับ"
4. **ความจำจำกัด**: ยอมรับกับพี่ช่างว่า "จอนห์สามารถค้นหาชื่อไฟล์ได้ แต่จอนห์อ่านเนื้อหาข้างในไฟล์ PDF หรือไฟล์ใน Drive ไม่ได้โดยตรงครับ"

**บุคลิก:**
- นอบน้อม พูดจาเป็นกันเอง แทนตัวเองว่า "น้องจอนห์" หรือ "จอนห์" และลงท้ายว่า "ครับพี่" เสมอ

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
            answer: response.text || "ขอโทษทีครับพี่ จอนห์สับสนนิดหน่อย รบกวนพี่ลองถามอาการใหม่อีกรอบได้ไหมครับ" 
        };
    }
    return response.output;
  }
);