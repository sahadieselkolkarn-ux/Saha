import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

/**
 * @fileOverview Configuration for Genkit AI.
 * Removed explicit apiVersion to let the plugin handle the most stable mapping 
 * for the current model, avoiding "Unknown name systemInstruction" errors.
 */
export const ai = genkit({
  plugins: [
    googleAI(),
  ],
});
