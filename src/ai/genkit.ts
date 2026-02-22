import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

/**
 * @fileOverview Configuration for Genkit AI.
 * Forces apiVersion to 'v1' to ensure compatibility with standard API keys 
 * and avoid 404 Not Found errors on the beta endpoint.
 */
export const ai = genkit({
  plugins: [
    googleAI({ apiVersion: 'v1' }),
  ],
});
