
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

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

/**
 * STOPPED: Kiosk token creation is temporarily disabled to prevent DB bloat.
 * Return a dummy token without committing to Firestore.
 */
export async function generateKioskToken(db: Firestore, previousTokenId?: string | null) {
  console.warn("Kiosk token creation is temporarily disabled.");
  
  // Return dummy values so callers don't crash
  const dummyTokenId = "DISABLED_BY_ADMIN";
  const nowMs = Date.now();
  const expiresAtMs = nowMs + TOKEN_TTL_MS;

  // We skip the writeBatch and commit entirely.
  return { newTokenId: dummyTokenId, expiresAtMs };
}
