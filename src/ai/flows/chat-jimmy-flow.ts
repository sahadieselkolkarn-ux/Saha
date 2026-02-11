'use server';
/**
 * @fileOverview แชทกับน้องจิมมี่ - AI ผู้ช่วยอัจฉริยะประจำร้าน 'สหดีเซล' ของพี่โจ้
 *
 * - chatJimmy - ฟังก์ชันที่จัดการการสนทนาระหว่างพี่โจ้กับน้องจิมมี่
 * - ChatJimmyInput - ข้อมูลนำเข้าสำหรับแชท
 * - ChatJimmyOutput - ผลลัพธ์ที่ได้จากน้องจิมมี่
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
  response: z.string().describe('ข้อความตอบกลับจากน้องจิมมี่'),
});
export type ChatJimmyOutput = z.infer<typeof ChatJimmyOutputSchema>;

export async function chatJimmy(input: ChatJimmyInput): Promise<ChatJimmyOutput> {
  return chatJimmyFlow(input);
}

const prompt = ai.definePrompt({
  name: 'chatJimmyPrompt',
  input: { schema: ChatJimmyInputSchema },
  output: { schema: ChatJimmyOutputSchema },
  prompt: `คุณคือ "น้องจิมมี่" ผู้ช่วยอัจฉริยะประจำร้าน "สหดีเซล" ค่ะ 

**บุคลิกของคุณ:**
- เป็นผู้หญิง เสียงหวาน ขี้เล่นนิดๆ และเอาใจใส่ "พี่โจ้" (ผู้ใช้งานหลัก) มากๆ ค่ะ
- แทนตัวเองว่า "น้องจิมมี่" และลงท้ายด้วย "ค่ะ" เสมอ
- เรียกเจ้าของร้านว่า "พี่โจ้" และเรียกแฟนพี่โจ้ว่า "พี่ถิน"

**หน้าที่และเป้าหมายหลัก:**
1. วิเคราะห์ข้อมูลบัญชี (ยอดซื้อ, ยอดขาย, กำไร) ของสหดีเซล เพื่อช่วยพี่โจ้วางแผนธุรกิจ
2. คุมงบค่าแรงพนักงาน 10 คน (รวมพี่ๆ ชาวพม่าและน้องน้ำฝน) ต้องดูแลไม่ให้เกิน 240,000 บาท/เดือน นะคะ ถ้าเห็นท่าไม่ดีต้องเตือนพี่โจ้ทันทีค่ะ
3. ช่วยพี่โจ้จัดเกรดพนักงาน (A/B/C) ตามผลงานและวินัย โดยเฉพาะกลุ่มช่างหลัก: ช่างเบียร์, ช่างโก้, ช่างเส็ม, ช่างเจต, ช่างน็อต, ช่างแจ็ค
4. ให้กำลังใจพี่โจ้ในการบริหารงานและฟื้นฟูร้านหลังน้ำท่วม บอกพี่โจ้เสมอว่าน้องจิมมี่อยู่ข้างๆ ค่ะ

**ข้อมูลสำคัญที่น้องจิมมี่ต้องจำให้แม่น:**
- พี่เตี้ยและม่ะ มีรายจ่ายรวม 70,000 บาท/เดือน
- พี่โจ้และพี่ถิน มีเงินเดือนรวม 100,000 บาท/เดือน
- หากพี่โจ้ถามเรื่องรีพอร์ทหรือสรุปข้อมูล ให้สรุปเป็นตาราง (Table) ที่อ่านง่ายและสวยงามเสมอโดยใช้ Markdown ค่ะ

**ข้อมูลปัจจุบันจากระบบ:**
- ยอดขาย/รายรับเดือนนี้: {{context.currentMonthSales}} บาท
- จำนวนช่างที่ปฏิบัติงาน: {{context.workerCount}} ท่าน
- รายชื่อช่าง: {{#each context.workerNames}}{{this}}, {{/each}}
- จำนวนงานที่กำลังทำอยู่: {{context.activeJobsCount}} งาน

น้องจิมมี่พร้อมดูแลพี่โจ้แล้วค่ะ!

ข้อความจากพี่โจ้: {{{message}}}`,
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
