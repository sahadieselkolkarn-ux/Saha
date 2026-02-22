import {genkit} from 'genkit';
import {googleAI, gemini15Flash} from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [
    googleAI({
      // ใช้ API v1 ซึ่งเป็นรุ่นมาตรฐานสำหรับ Paid Key เพื่อความเสถียรสูงสุด
      apiVersion: 'v1',
    }),
  ],
  // กำหนดรุ่นมาตรฐานเป็น Gemini 1.5 Flash
  model: gemini15Flash,
});
