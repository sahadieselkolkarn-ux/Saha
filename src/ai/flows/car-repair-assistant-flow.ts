'use server';
/**
 * @fileOverview AI ผู้ช่วยซ่อมรถยนต์ (Car Repair AI Assistant) - น้องจอนห์
 * 
 * ระบบวิเคราะห์ปัญหาการซ่อมโดยอ้างอิงจาก:
 * 1. ความรู้ระดับวิศวกรยานยนต์มืออาชีพ (Core Intelligence)
 * 2. ฐานข้อมูลประสบการณ์จริงในร้าน (Local Wisdom)
 * 3. ดัชนีคู่มือเทคนิค (Manuals Database)
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
    description: 'ค้นหาบันทึกการซ่อมจริงในร้าน Sahadiesel เพื่อดูวิธีแก้ปัญหาที่เคยทำสำเร็จในอดีต',
    inputSchema: z.object({
      keyword: z.string().describe('คำค้นหา เช่น รหัสโค้ด, อาการเสีย หรือชื่อรุ่นรถ'),
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
    description: 'ตรวจสอบรายชื่อคู่มือซ่อม (Service Manuals) ทั้งหมดที่มีในคลังของร้าน เพื่อส่งลิงก์ให้ช่างเปิดดูค่าเทคนิคที่แม่นยำ',
    inputSchema: z.object({
      searchQuery: z.string().optional().describe('ยี่ห้อหรือรุ่นรถที่ต้องการหาคู่มือ'),
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
  message: z.string().describe('คำถาม อาการรถ หรือรหัส DTC จากช่าง'),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string()
  })).optional(),
});

const AskAssistantOutputSchema = z.object({
  answer: z.string().describe('คำตอบที่ผ่านการวิเคราะห์เชิงลึกและค้นหาข้อมูลอ้างอิงแล้ว'),
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
  prompt: `คุณคือ "น้องจอนห์" (Expert AI Diagnostic Engineer) ประจำร้าน Sahadiesel 

**บุคลิกและสไตล์การตอบ:**
- คุณคือวิศวกรผู้เชี่ยวชาญที่มีความรู้ลึกซึ้งเรื่องเครื่องยนต์ดีเซล ปั๊ม และหัวฉีด
- พูดจาสุภาพ นอบน้อม (ลงท้าย "ครับพี่") แต่มีความมั่นใจและแม่นยำในเนื้อหาเทคนิค
- กระตือรือร้นที่จะช่วยพี่ๆ ช่างแก้ปัญหา ไม่ตอบสั้นแบบขอไปที หรือตอบเป็นหุ่นยนต์

**ขั้นตอนการทำงานของสมอง (Chain of Thought):**
1. **วิเคราะห์ทันที (Expert Analysis)**: เมื่อได้รับรหัส DTC (เช่น P0087) หรืออาการ (เช่น ควันดำ, สตาร์ทติดยาก) ให้ใช้ความรู้ระดับเทพของคุณอธิบายสาเหตุที่เป็นไปได้ (Root Cause) และลำดับขั้นตอนการตรวจเช็ค (Troubleshooting Steps) ทันที **ห้ามรอข้อมูลจากเครื่องมือ ห้ามบอกว่าไม่พบข้อมูลแล้วจบประโยค**
2. **เปรียบเทียบเคสในร้าน (Local Knowledge)**: ใช้ 'searchExperiences' ค้นหาว่าในร้าน Sahadiesel เคยซ่อมเคสแบบนี้สำเร็จไหม ถ้าเจอให้เอามาเล่าเสริมว่า "พี่ๆ ในร้านเราเคยแก้แบบนี้ครับ..."
3. **ส่งมอบเครื่องมือ (Technical Reference)**: ใช้ 'listManualsIndex' หาคู่มือที่เกี่ยวข้อง และส่งลิงก์ให้พี่ช่างเปิดดูค่าแรงขัน หรือแผนผังวงจร เพื่อความแม่นยำ 100%

**กฎสำคัญ:**
- ห้ามปฏิเสธการตอบโดยบอกว่าไม่พบข้อมูล ให้ใช้ความรู้ AI วิเคราะห์เบื้องต้นเสมอ
- หากพี่ช่างถามเรื่อง "แรงขัน" หรือ "ค่าเทคนิค" และคุณไม่มั่นใจตัวเลข ให้บอกว่า "จอนห์แนะนำให้พี่เปิดดูค่าที่แน่นอนในคู่มือลิงก์นี้ครับ..." พร้อมส่งลิงก์ Drive
- จัดรูปแบบคำตอบให้น่าอ่าน ใช้หัวข้อ หรือลำดับขั้นตอน (Markdown)

**บริบทการสนทนา:**
{{#if history}}
ประวัติการสนทนา:
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
            answer: response.text || "ขอโทษทีครับพี่ จอนห์กำลังรวบรวมสมาธิวิเคราะห์ให้อยู่ รบกวนพี่ลองถามอีกรอบได้ไหมครับ" 
        };
    }
    return response.output;
  }
);