"use client";

import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { initializeFirebase } from "@/firebase/init";
import { createUserProfile } from "./user";

export async function signUp(email: string, password: string, displayName: string, phone: string) {
  const { auth } = initializeFirebase();
  if (!auth) throw new Error("Auth not initialized");

  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  await updateProfile(user, { displayName });

  await createUserProfile(user.uid, {
    displayName,
    email,
    phone,
    role: "WORKER",
    status: "PENDING",
  });

  return user;
}
