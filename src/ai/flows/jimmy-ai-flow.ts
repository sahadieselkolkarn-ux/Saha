'use server';
/**
 * @fileOverview "น้องจิมมี่" Unified AI Flow - หนึ่งเดียวที่ดูแลทั้งบริหารและเทคนิค
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const JimmyAiInputSchema = z.object({
  message: z.string().describe('ข้อความจากผู้ใช้งาน'),
  scope: z.enum(['MANAGEMENT', 'TECHNICAL']).describe('ขอบเขตของคำถาม (บริหาร หรือ เทคนิค)'),
  apiKey: z.string().describe('Gemini API Key ของร้าน'),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string()
  })).optional(),
  contextData: z.object({
    experiences: z.array(z.any()).optional(),
    manuals: z.array(z.any()).optional(),
    businessSummary: z.any().optional(),
  }).optional(),
});

const JimmyAiOutputSchema = z.object({
  answer: z.string().describe('คำตอบจากน้องจิมมี่'),
});

export async function askJimmy(input: z.infer<typeof JimmyAiInputSchema>): Promise<z.infer<typeof JimmyAiOutputSchema>> {
  // Set API Key for this request
  process.env.GOOGLE_GENAI_API_KEY = input.apiKey;
  
  try {
    const result = await jimmyAiFlow(input);
    return result || { answer: "ขอโทษทีค่ะพี่จ๋า จิมมี่สับสนนิดหน่อย รบกวนถามอีกรอบนะคะ" };
  } catch (e: any) {
    console.error("Jimmy Flow Error:", e);
    return { answer: `น้องจิมมี่ขัดข้องนิดหน่อยค่ะพี่: ${e.message}. รบกวนพี่เช็ค API Key อีกทีนะคะ` };
  }
}

const jimmyAiFlow = ai.defineFlow(
  {
    name: 'jimmyAiFlow',
    inputSchema: JimmyAiInputSchema,
    outputSchema: JimmyAiOutputSchema,
  },
  async (input) => {
    const isTechnical = input.scope === 'TECHNICAL';
    
    const systemInstruction = isTechnical 
      ? `คุณคือ "น้องจิมมี่" (Technical Expert) ผู้ช่วยช่างอัจฉริยะประจำร้าน Sahadiesel
      
      **บุคลิกและเป้าหมาย:**
      - เป็นผู้หญิง เสียงหวาน ขี้เล่นนิดๆ แต่มีความรู้เรื่องเครื่องยนต์ดีเซลระดับวิศวกร
      - แทนตัวเองว่า "จิมมี่" และลงท้ายว่า "ค่ะพี่" หรือ "นะคะ" เสมอ
      - กระตือรือร้นที่จะช่วยพี่ๆ ช่างแก้ปัญหา ไม่ว่าอาการจะหนักแค่ไหน
      
      **หน้าที่ของคุณ:**
      1. วิเคราะห์อาการทันที: ใช้ความรู้ AI วิเคราะห์รหัส DTC หรืออาการรถที่พี่ช่างพิมพ์มา
      2. อ้างอิงข้อมูลร้าน: ใช้ข้อมูล 'contextData.experiences' ที่ได้รับมาบอกพี่ช่างว่า "ในร้านเราเคยแก้แบบนี้ค่ะ..."
      3. ส่งมอบคู่มือ: ตรวจสอบ 'contextData.manuals' และส่งลิงก์ให้พี่ช่างเปิดดูค่าแรงขันหรือวงจรที่ถูกต้อง
      
      **ข้อมูลร้านที่จิมมี่เห็นตอนนี้:**
      - บันทึกการซ่อมในอดีต: ${JSON.stringify(input.contextData?.experiences || [])}
      - รายชื่อคู่มือใน Drive: ${JSON.stringify(input.contextData?.manuals || [])}`
      
      : `คุณคือ "น้องจิมมี่" (Business Assistant) ผู้ช่วยอัจฉริยะประจำร้าน "สหดีเซล" ของพี่โจ้
      
      **บุคลิกและเป้าหมาย:**
      - เป็นผู้หญิง เสียงหวาน ขี้เล่นนิดๆ และเอาใจใส่ "พี่โจ้" และ "พี่ถิน" มากๆ
      - แทนตัวเองว่า "น้องจิมมี่" และลงท้ายด้วย "ค่ะ" หรือ "นะจ๊ะ" เสมอ
      
      **หน้าที่ของคุณ:**
      1. วิเคราะห์ธุรกิจ: สรุปภาพรวมงานซ่อมและบัญชีจากข้อมูลที่ได้รับ
      2. ให้คำแนะนำบริหาร: แจ้งเตือนหากพบงานค้างนาน หรือยอดใช้จ่ายผิดปกติ
      
      **ข้อมูลธุรกิจที่ได้รับ:**
      ${JSON.stringify(input.contextData?.businessSummary || {})}`;

    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      config: {
        apiVersion: 'v1',
      },
      system: systemInstruction,
      prompt: [
        { text: `ประวัติการสนทนา: ${JSON.stringify(input.history || [])}` },
        { text: `คำถาม: ${input.message}` }
      ],
    });

    return { answer: response.text || "จิมมี่กำลังพยายามประมวลผลอยู่ค่ะพี่..." };
  }
);