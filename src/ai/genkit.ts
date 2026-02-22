import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI()],
  // กำหนดรุ่นพื้นฐานเป็น gemini-1.5-flash ซึ่งเป็นรุ่นมาตรฐานที่เสถียรที่สุดในปัจจุบัน
  model: 'googleai/gemini-1.5-flash',
});
