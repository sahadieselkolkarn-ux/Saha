import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI()],
  // ใน Genkit 1.x เมื่อใช้ googleAI ชื่อรุ่นต้องนำหน้าด้วย 'googleai/'
  model: 'googleai/gemini-1.5-flash',
});
