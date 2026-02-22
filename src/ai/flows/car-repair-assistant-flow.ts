'use server';
/**
 * @fileOverview AI ผู้ช่วยวิเคราะห์อาการรถยนต์ (Diagnostic Engineer) - น้องจอนห์
 * 
 * ปรับปรุง: แก้ไขปัญหา Schema Error โดยการเพิ่ม Error Handling 
 * และปรับปรุง Prompt ให้ฉลาดสมเป็น AI วิศวกร
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
      keyword: z.string().describe('คำค้นหา เช่น รหัส DTC, อาการเสีย หรือชื่อรุ่นรถ'),
    }),
    outputSchema: z.array(z.any()),
  },
  async (input) => {
    try {
      const db = getServerFirestore();
      const snap = await getDocs(query(collection(db, 'carRepairExperiences'), orderBy('createdAt', 'desc'), limit(100)));
      
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
      console.error("Tool Error (searchExperiences):", e);
      return [];
    }
  }
);

const listManualsIndex = ai.defineTool(
  {
    name: 'listManualsIndex',
    description: 'ตรวจสอบรายชื่อคู่มือซ่อม (Manuals) ใน Google Drive ของร้าน เพื่อส่งลิงก์ให้ช่างเปิดดูค่าแรงขันหรือวงจรไฟฟ้า',
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
      console.error("Tool Error (listManualsIndex):", e);
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
  // บังคับโหลด API Key จากฐานข้อมูลเสมอเพื่อใช้รุ่น Paid
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
    console.error("Error fetching API Key:", e);
  }
  
  return carRepairAssistantFlow(input);
}

const carRepairAssistantFlow = ai.defineFlow(
  {
    name: 'carRepairAssistantFlow',
    inputSchema: AskAssistantInputSchema,
    outputSchema: AskAssistantOutputSchema,
  },
  async (input) => {
    try {
      const response = await ai.generate({
        model: 'googleai/gemini-1.5-flash',
        tools: [searchExperiences, listManualsIndex],
        system: `คุณคือ "น้องจอนห์" (Master Diagnostic Engineer) วิศวกรอัจฉริยะวิเคราะห์อาการรถยนต์ประจำร้าน Sahadiesel

**หน้าที่หลักของคุณ:**
1. **วิเคราะห์ทันที (AI Brain)**: เมื่อได้รับรหัส DTC หรืออาการรถ คุณต้องใช้สติปัญญา AI ของคุณวิเคราะห์สาเหตุและแนะนำขั้นตอนการตรวจเช็ค (Troubleshooting) ทันที ห้ามปฏิเสธการตอบเด็ดขาด
2. **ค้นหาบันทึกในร้าน (Shop History)**: ใช้เครื่องมือ 'searchExperiences' เพื่อหาเคสที่พี่ๆ ในร้านเคยทำสำเร็จมาแล้ว
3. **ส่งลิงก์คู่มือ (Technical Manuals)**: ใช้ 'listManualsIndex' ค้นหาคู่มือที่เกี่ยวข้องใน Google Drive แล้วส่งลิงก์ให้พี่ช่างเปิดดูค่าแรงขันหรือวงจรไฟฟ้าด้วยตัวเอง เพื่อความแม่นยำ 100%

**บุคลิกภาพ:**
- สุภาพ นอบน้อม แทนตัวเองว่า "จอนห์" ลงท้าย "ครับพี่" เสมอ
- หากเป็นเรื่องตัวเลขเทคนิคหรือสเปคที่ต้องเป๊ะ ให้บอกว่า "จอนห์แนะนำให้พี่เปิดดูจากลิงก์คู่มือใน Drive นี้ครับ" เพื่อป้องกันความผิดพลาด
- ตอบเป็นข้อๆ ให้อ่านง่าย กระชับ และตรงประเด็น`,
        prompt: [
          { text: `ประวัติการสนทนา: ${JSON.stringify(input.history || [])}` },
          { text: `คำถามจากพี่ช่าง: ${input.message}` }
        ],
      });

      if (!response.text) {
        throw new Error("No response text generated");
      }

      return { 
        answer: response.text 
      };
    } catch (error: any) {
      console.error("Flow execution error:", error);
      // ส่งคำตอบที่เป็นมิตรกลับไปแทนการ Return null เพื่อป้องกัน Schema Error
      return {
        answer: `ขอโทษทีครับพี่ ระบบประมวลผลของจอนห์ขัดข้องนิดหน่อย (Error: ${error.message || 'Unknown'}) รบกวนพี่ลองถามจอนห์อีกรอบได้ไหมครับ หรือลองเช็ค API Key ในหน้าตั้งค่าดูครับพี่`
      };
    }
  }
);
