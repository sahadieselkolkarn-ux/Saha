"use client";

import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from "firebase/firestore";

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
    batch.update(oldTokenRef, { isActive: false });
  }

  // Create a new token
  const newTokenId = generateToken();
  const newTokenRef = doc(db, "kioskTokens", newTokenId);
  
  const now = Timestamp.now();
  const expiresAt = new Timestamp(now.seconds + 60, now.nanoseconds); // Expires in 60 seconds

  batch.set(newTokenRef, {
    createdAt: serverTimestamp(),
    expiresAt: expiresAt,
    isActive: true,
    id: newTokenId,
  });

  await batch.commit();
  return newTokenId;
}
