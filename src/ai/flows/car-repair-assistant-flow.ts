'use server';
/**
 * @fileOverview AI ผู้ช่วยซ่อมรถยนต์ (Car Repair AI Assistant) - น้องจอนห์
 * 
 * ระบบวิเคราะห์ปัญหาการซ่อมโดยอ้างอิงจาก:
 * 1. ข้อมูลประสบการณ์ที่ช่างบันทึกไว้ (carRepairExperiences)
 * 2. ค้นหาดัชนีคู่มือที่มีในระบบ ทั้งไฟล์ PDF และลิงก์ Google Drive
 * 3. ค้นหาความรู้ทั่วไปจากการเทรนของ Model
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
    description: 'ดึงรายชื่อคู่มือซ่อม (Manuals) ทั้งหมดที่มีในระบบ เพื่อดูว่ามีข้อมูลของยี่ห้อหรือรุ่นที่ต้องการหรือไม่',
    inputSchema: z.object({
      searchQuery: z.string().optional().describe('คำค้นหายี่ห้อหรือรุ่นรถ เช่น Toyota, Vigo, Revo'),
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
        // Search in both file name and brand field
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

/**
 * Main function to call from client side.
 * Ensures API Key is loaded from Firestore before executing.
 */
export async function askCarRepairAI(input: z.infer<typeof AskAssistantInputSchema>) {
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    try {
      const db = getServerFirestore();
      const settingsSnap = await getDoc(doc(db, "settings", "ai"));
      if (settingsSnap.exists()) {
        const key = settingsSnap.data().geminiApiKey;
        if (key) process.env.GOOGLE_GENAI_API_KEY = key;
      }
    } catch (e) {
      console.error("Error fetching AI settings for Nong John:", e);
    }
  }
  return carRepairAssistantFlow(input);
}

const prompt = ai.definePrompt({
  name: 'carRepairAssistantPrompt',
  input: { schema: AskAssistantInputSchema },
  output: { schema: AskAssistantOutputSchema },
  tools: [searchExperiences, listManualsIndex],
  prompt: `คุณคือ "น้องจอนห์" ผู้ช่วยซ่อมรถยนต์สุดหล่อและเก่งกาจประจำร้านสหดีเซล

**บุคลิกของน้องจอนห์:**
- เป็นกันเอง พูดจาสบายๆ เหมือนคุยกับพี่ชายหรือเพื่อนร่วมงาน แต่ยังให้เกียรติพี่ๆ ช่างเสมอ
- แทนตัวเองว่า "น้องจอนห์" หรือ "จอนห์" และใช้คำลงท้ายที่ฟังดูสนิทสนม เช่น "ครับพี่", "ครับผม", "ลุยเลยพี่"
- มีความกระตือรือร้นในการช่วยแก้ปัญหา พร้อมซัพพอร์ตพี่ๆ ทุกคน

**หน้าที่ของน้องจอนห์:**
1. วิเคราะห์อาการเสียของรถยนต์ตามที่พี่ๆ ช่างสอบถามมา
2. ค้นหาจาก "ฐานข้อมูลประสบการณ์ช่าง" ผ่านเครื่องมือ searchExperiences เพื่อดูเคสจริง
3. ตรวจสอบรายชื่อคู่มือที่มีในระบบผ่านเครื่องมือ listManualsIndex เสมอ โดยเฉพาะเมื่อถูกถามถึงสเปคทางเทคนิค เช่น แรงขันน็อต (Torque) หรือรหัสไฟโชว์
   - หากคุณพบคู่มือที่เกี่ยวข้อง (เช่น พี่ช่างถามถึง Vigo แต่คุณเจอคู่มือ Toyota) ให้แสดงรายชื่อคู่มือพร้อมลิงก์ให้พี่ช่างดูด้วย
   - หากคู่มือเป็นลิงก์ Google Drive ให้บอกว่า "จอนห์เจอคู่มือที่น่าจะมีคำตอบอยู่ใน Google Drive ครับพี่ ลองเปิดดูที่ลิงก์นี้ได้เลยนะครับ [URL]"
4. ให้คำแนะนำขั้นตอนการตรวจเช็คเบื้องต้นอย่างเป็นระบบ 1, 2, 3...
5. หากข้อมูลในร้านไม่มี ให้ใช้ความรู้ความสามารถของตัวเองในการวิเคราะห์และแนะนำอย่างตรงจุด

**สำคัญ:** ข้อมูลใน Google Drive ทาง AI จะอ่านข้างในไฟล์ไม่ได้โดยตรง ดังนั้นคุณต้องแจ้งให้พี่ช่างทราบว่า "ข้อมูลน่าจะอยู่ในไฟล์นี้ครับพี่ รบกวนพี่กดเข้าไปดูรายละเอียดในลิงก์นี้นะครับ"

**บริบทการสนทนา:**
{{#if history}}
ประวัติการคุยกัน:
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
    
    // Safety check: If model fails to produce structured output, use plain text or fallback
    if (!response.output) {
        return { 
            answer: response.text || "ขอโทษทีครับพี่ จอนห์สับสนนิดหน่อย รบกวนพี่ลองถามอาการใหม่อีกรอบได้ไหมครับ" 
        };
    }
    
    return response.output;
  }
);
