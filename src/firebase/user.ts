"use client";

import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import type { Role, UserStatus } from "@/lib/constants";

interface UserProfileData {
    displayName: string;
    email: string;
    phone: string;
    role: Role;
    status: UserStatus;
}

export async function createUserProfile(uid: string, data: UserProfileData) {
    const db = getFirestore();
    const userDocRef = doc(db, "users", uid);

    const profileData = {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    await setDoc(userDocRef, profileData);
    return profileData;
}
