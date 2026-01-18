"use client";

import { getAuth, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { createUserProfile } from "./user";

export async function signUp(email: string, password: string, name: string, phone: string) {
    const auth = getAuth();
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update Firebase Auth profile
    await updateProfile(user, { displayName: name });

    // Create user profile in Firestore
    await createUserProfile(user.uid, {
        name,
        email,
        phone,
        role: 'WORKER', 
        status: 'PENDING'
    });

    return user;
}
