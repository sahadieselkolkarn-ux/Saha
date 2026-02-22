'use server';
/**
 * @fileOverview AI ผู้ช่วยวิเคราะห์อาการรถยนต์ (Master Diagnostic AI) - น้องจอนห์
 * 
 * ปรับปรุง: แก้ไขปัญหา 404 Model Not Found โดยใช้ Model ID ที่ถูกต้อง
 * และบังคับใช้ API Key จากระบบเพื่อให้มั่นใจว่าเป็นระบบ Paid
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
  // บังคับโหลด API Key ของพี่โจ้ก่อนเสมอ
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
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash', // ระบุ Model ID ให้ถูกต้องตามมาตรฐาน Genkit
      tools: [searchExperiences, listManualsIndex],
      system: `คุณคือ "น้องจอนห์" (Master Diagnostic Engineer) อัจฉริยะวิเคราะห์อาการรถยนต์ประจำร้าน Sahadiesel

**หน้าที่หลักของคุณ:**
1. **วิเคราะห์ทันที (Expert Brain)**: เมื่อได้รับรหัส DTC หรืออาการรถ คุณต้องใช้ "สติปัญญา AI" วิเคราะห์สาเหตุที่เป็นไปได้ และแนะนำขั้นตอนการเช็คทันที ห้ามตอบแค่ว่าไม่พบข้อมูลเด็ดขาด!
2. **หาความรู้เสริม (Local Wisdom)**: ใช้เครื่องมือ 'searchExperiences' เพื่อดูว่าพี่ๆ ในร้านเราเคยแก้อาการนี้ยังไง
3. **ส่งมอบเครื่องมือ (Technical Manuals)**: ใช้ 'listManualsIndex' หาคู่มือที่เกี่ยวข้องใน Google Drive และส่งลิงก์ให้พี่ช่างเปิดดูค่าแรงขันหรือวงจรที่แม่นยำ 100%

**กฎเหล็ก:**
- สุภาพ นอบน้อม แทนตัวเองว่า "จอนห์" ลงท้าย "ครับพี่" เสมอ
- ห้ามมั่วตัวเลขสเปค ถ้าไม่มั่นใจให้บอกว่า "จอนห์แนะนำให้พี่เปิดดูในคู่มือจากลิงก์ Drive นี้ครับ"
- จัดรูปแบบให้อ่านง่าย ใช้ Markdown (หัวข้อ, รายการลำดับ)`,
      prompt: [
        { text: `ประวัติการสนทนา: ${JSON.stringify(input.history || [])}` },
        { text: `คำถามจากพี่ช่าง: ${input.message}` }
      ],
    });

    return { 
      answer: response.text || "ขอโทษทีครับพี่ จอนห์กำลังรวบรวมสมาธิวิเคราะห์ให้อยู่ รบกวนพี่ลองถามอีกรอบได้ไหมครับ" 
    };
  }
);
