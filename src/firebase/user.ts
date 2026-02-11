"use client";

import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import type { Role, UserStatus } from "@/lib/constants";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError, type SecurityRuleContext } from "@/firebase/errors";
import { initializeFirebase } from "@/firebase/init"; // ✅ เพิ่มบรรทัดนี้

interface UserProfileData {
  displayName: string;
  email: string;
  phone: string;
  role: Role;
  status: UserStatus;
}

export async function createUserProfile(uid: string, data: UserProfileData) {
  const { firestore } = initializeFirebase();         // ✅ เปลี่ยน
  if (!firestore) throw new Error("Firestore not initialized"); // ✅ กันเคสแปลก ๆ
  const userDocRef = doc(firestore, "users", uid);    // ✅ เปลี่ยน

  const profileData = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  setDoc(userDocRef, profileData, { merge: true }).catch(async (error) => {
    if (error.code === "permission-denied") {
      const permissionError = new FirestorePermissionError({
        path: userDocRef.path,
        operation: "write",
        requestResourceData: profileData,
      } satisfies SecurityRuleContext);
      errorEmitter.emit("permission-error", permissionError);
    }
  });

  return profileData;
}
