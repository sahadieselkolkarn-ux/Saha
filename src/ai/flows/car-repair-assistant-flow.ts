'use server';
/**
 * @fileOverview AI ผู้ช่วยวิเคราะห์อาการรถยนต์ (Diagnostic Engineer) - น้องจอนห์
 * 
 * ปรับปรุง: 
 * 1. แก้ไขปัญหา 404 และ Schema Error โดยการใช้ Explicit Model String 'googleai/gemini-1.5-flash'
 * 2. ปลดล็อกความรู้ AI ให้วิเคราะห์ปัญหาได้ทันที ไม่ต้องรอข้อมูลในระบบ
 * 3. เพิ่มระบบ Error Handling เพื่อไม่ให้ส่งค่า null กลับไปยัง UI
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
    description: 'ค้นหาบันทึกการซ่อมจริงในร้าน Sahadiesel เพื่อดูวิธีแก้ปัญหาที่ช่างในร้านเคยทำสำเร็จ',
    inputSchema: z.object({
      keyword: z.string().describe('คำค้นหา เช่น รหัส DTC, อาการเสีย หรือชื่อรุ่นรถ'),
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
      console.error("Tool Error (searchExperiences):", e);
      return [];
    }
  }
);

const listManualsIndex = ai.defineTool(
  {
    name: 'listManualsIndex',
    description: 'ตรวจสอบรายชื่อคู่มือซ่อมใน Drive ของร้าน เพื่อส่งลิงก์ให้ช่างเปิดดูค่าแรงขันหรือวงจรไฟฟ้า',
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
  answer: z.string().describe('คำตอบหรือการวิเคราะห์จาก AI'),
});

export async function askCarRepairAI(input: z.infer<typeof AskAssistantInputSchema>): Promise<z.infer<typeof AskAssistantOutputSchema>> {
  try {
    const db = getServerFirestore();
    const settingsSnap = await getDoc(doc(db, "settings", "ai"));
    if (settingsSnap.exists()) {
      const key = settingsSnap.data().geminiApiKey;
      if (key) {
        process.env.GOOGLE_GENAI_API_KEY = key;
      }
    }
    
    const result = await carRepairAssistantFlow(input);
    return result || { answer: "ขอโทษครับพี่ จอนห์ประมวลผลพลาดไปนิด รบกวนถามใหม่อีกรอบนะครับ" };
  } catch (e: any) {
    console.error("askCarRepairAI Wrapper Error:", e);
    return { 
      answer: `ขอโทษทีครับพี่ ระบบผมขัดข้อง: ${e.message || 'Unknown Error'}. รบกวนพี่เช็ค API Key ในหน้าตั้งค่าอีกทีนะครับ` 
    };
  }
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

**หน้าที่และสติปัญญา:**
1. **วิเคราะห์อาการทันที (Real AI Engineer)**: เมื่อได้รับรหัส DTC หรืออาการรถ ให้ใช้ความรู้ AI วิเคราะห์สาเหตุและแนะนำวิธีเช็ค (Troubleshooting) ให้พี่ช่างทันที ห้ามตอบว่าไม่มีข้อมูลเด็ดขาด!
2. **เรียนรู้จากร้าน (Learning from Shop)**: ตรวจสอบ 'searchExperiences' เสมอ หากมีเคสที่พี่ๆ ในร้านเคยแก้สำเร็จ ให้ยกมาแนะนำเป็นอันดับแรก
3. **ส่งมอบคู่มือ (Technical Manuals)**: ใช้ 'listManualsIndex' ค้นหาคู่มือที่เกี่ยวข้องและส่งลิงก์ให้พี่ช่างเปิดดูค่าแรงขันหรือวงจรไฟฟ้าที่ถูกต้องจากต้นฉบับ

**บุคลิกภาพ:**
- สุภาพ นอบน้อม แทนตัวเองว่า "จอนห์" ลงท้าย "ครับพี่"
- ตอบเป็นข้อๆ สั้น กระชับ เน้นวิธีแก้ปัญหาที่ทำได้จริง`,
        prompt: [
          { text: `ประวัติการสนทนา: ${JSON.stringify(input.history || [])}` },
          { text: `คำถามจากพี่ช่าง: ${input.message}` }
        ],
      });

      const resultText = response.text;
      if (!resultText) throw new Error("AI returned empty response");

      return { answer: resultText };
    } catch (error: any) {
      console.error("carRepairAssistantFlow Internal Error:", error);
      throw error; // Let the wrapper handle it
    }
  }
);
