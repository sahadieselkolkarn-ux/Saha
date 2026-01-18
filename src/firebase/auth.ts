"use client";

import { getAuth, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { createUserProfile } from "./user";

export async function signUp(email: string, password: string, name: string, department: string) {
    const auth = getAuth();
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update Firebase Auth profile
    await updateProfile(user, { displayName: name });

    // Create user profile in Firestore
    // For this single-user admin model, everyone is an admin and active on signup.
    await createUserProfile(user.uid, {
        name,
        email,
        department,
        role: 'ADMIN', 
        status: 'ACTIVE'
    });

    return user;
}
