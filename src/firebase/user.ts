"use client";

import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import type { Role, UserStatus } from "@/lib/constants";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

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

    setDoc(userDocRef, profileData, { merge: true })
      .catch(async (error) => {
        if (error.code === 'permission-denied') {
          const permissionError = new FirestorePermissionError({
            path: userDocRef.path,
            operation: 'write',
            requestResourceData: profileData,
          } satisfies SecurityRuleContext);
          errorEmitter.emit('permission-error', permissionError);
        }
      });

    return profileData;
}
