
"use client";

import {
  collection,
  doc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { TOKEN_TTL_MS } from "@/lib/constants";

// Helper to generate a random string for the token
function generateToken(length: number = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function generateKioskToken(db: Firestore, previousTokenId?: string | null) {
  const batch = writeBatch(db);
  
  // Deactivate the previous token if it exists
  if (previousTokenId) {
    const oldTokenRef = doc(db, "kioskTokens", previousTokenId);
    batch.set(oldTokenRef, { isActive: false }, { merge: true });
  }

  // Create a new token
  const newTokenId = generateToken();
  const newTokenRef = doc(db, "kioskTokens", newTokenId);
  
  const nowMs = Date.now();
  const expiresAtMs = nowMs + TOKEN_TTL_MS;

  batch.set(newTokenRef, {
    id: newTokenId,
    createdAtMs: nowMs,
    expiresAtMs: expiresAtMs,
    isActive: true,
  });

  await batch.commit();
  return { newTokenId, expiresAtMs };
}
