"use client";

import {
  doc,
  setDoc,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";

const TOKEN_TTL_MS = 300000; // 5 minutes

function getOrCreateKioskId(): string {
  if (typeof window === 'undefined') return 'server_default';
  let kioskId = localStorage.getItem('kiosk_device_id');
  if (!kioskId) {
    kioskId = 'kiosk_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('kiosk_device_id', kioskId);
  }
  return kioskId;
}

/**
 * Generates or rotates a kiosk token within a single document per device.
 */
export async function generateKioskToken(db: Firestore) {
  const kioskId = getOrCreateKioskId();
  const tokenRef = doc(db, "kioskTokens", kioskId);
  
  const currentToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const nowMs = Date.now();
  const expiresAtMs = nowMs + TOKEN_TTL_MS;

  await setDoc(tokenRef, {
    kioskId,
    currentToken,
    expiresAtMs,
    isActive: true,
    updatedAt: serverTimestamp(),
    updatedAtMs: nowMs
  }, { merge: true });

  return { kioskId, currentToken, expiresAtMs };
}
