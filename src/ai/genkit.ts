import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

/**
 * @fileOverview Configuration for Genkit AI.
 * Updated to use explicit v1 API version for Paid API Key stability.
 */
export const ai = genkit({
  plugins: [
    googleAI({
      apiVersion: 'v1',
    }),
  ],
  // We specify the model explicitly in each call to ensure reliability
});
