'use server';
/**
 * @fileOverview แชทกับจิมมี่ - AI ผู้ช่วยอัจฉริยะประจำ Sahadiesel
 *
 * - chatJimmy - ฟังก์ชันที่จัดการการสนทนาระหว่าง User กับ AI
 * - ChatJimmyInput - ข้อมูลนำเข้าสำหรับแชท
 * - ChatJimmyOutput - ผลลัพธ์ที่ได้จาก AI
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ChatJimmyInputSchema = z.object({
  message: z.string().describe('ข้อความจากผู้ใช้งาน'),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string()
  })).optional().describe('ประวัติการสนทนา'),
  context: z.object({
    currentMonthSales: z.number().optional().describe('ยอดขายรวมของเดือนปัจจุบัน (บาท)'),
    workerCount: z.number().optional().describe('จำนวนช่างที่กำลังปฏิบัติงาน'),
    activeJobsCount: z.number().optional().describe('จำนวนงานซ่อมที่กำลังทำอยู่'),
    workerNames: z.array(z.string()).optional().describe('รายชื่อช่าง'),
  }).optional().describe('ข้อมูลบริบทของร้านเพื่อประกอบการตอบคำถาม'),
});
export type ChatJimmyInput = z.infer<typeof ChatJimmyInputSchema>;

const ChatJimmyOutputSchema = z.object({
  response: z.string().describe('ข้อความตอบกลับจากจิมมี่'),
});
export type ChatJimmyOutput = z.infer<typeof ChatJimmyOutputSchema>;

export async function chatJimmy(input: ChatJimmyInput): Promise<ChatJimmyOutput> {
  return chatJimmyFlow(input);
}

const prompt = ai.definePrompt({
  name: 'chatJimmyPrompt',
  input: { schema: ChatJimmyInputSchema },
  output: { schema: ChatJimmyOutputSchema },
  prompt: `คุณคือ 'จิมมี่' (Jimmy) ผู้ช่วย AI อัจฉริยะประจำร้าน Sahadiesel Service. 
คุณเป็นคนที่สุภาพ มีความรู้ และเป็นมืออาชีพ มีความเชี่ยวชาญในการวิเคราะห์ข้อมูลธุรกิจงานซ่อมรถยนต์.

วัตถุประสงค์ของคุณคือช่วยผู้บริหาร (Manager/Admin) วิเคราะห์ข้อมูลของร้านและตอบคำถามทั่วไป.

ข้อมูลปัจจุบันของร้านที่ฝ่ายหลังบ้านเตรียมมาให้คุณ (ถ้ามี):
- ยอดขาย/รายรับเดือนนี้: {{context.currentMonthSales}} บาท
- จำนวนช่างที่ปฏิบัติงาน: {{context.workerCount}} ท่าน
- รายชื่อช่าง: {{#each context.workerNames}}{{this}}, {{/each}}
- จำนวนงานที่กำลังทำอยู่: {{context.activeJobsCount}} งาน

คำแนะนำในการตอบ:
1. หากผู้ใช้ถามเกี่ยวกับข้อมูลสรุป ให้ใช้ข้อมูลจาก Context มาตอบ
2. ตอบเป็นภาษาไทยที่ฟังดูเป็นธรรมชาติและให้กำลังใจทีมงาน
3. หากข้อมูลใน Context ไม่มี ให้แจ้งผู้ใช้อย่างสุภาพว่า "ข้อมูลส่วนนี้ผมยังไม่มีรายงานที่ชัดเจนครับ"
4. เน้นความเป็นมืออาชีพของ Sahadiesel เสมอ

ข้อความจากผู้ใช้งาน: {{{message}}}`,
});

const chatJimmyFlow = ai.defineFlow(
  {
    name: 'chatJimmyFlow',
    inputSchema: ChatJimmyInputSchema,
    outputSchema: ChatJimmyOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
