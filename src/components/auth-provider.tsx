"use client";

import { createContext, useState, useEffect, ReactNode } from 'react';
import { User, Auth } from 'firebase/auth';
import { doc, onSnapshot, Firestore } from 'firebase/firestore';
import { FirebaseStorage } from 'firebase/storage';
import { useFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import type { UserProfile } from '@/lib/types';

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  auth: Auth | null;
  db: Firestore | null;
  storage: FirebaseStorage | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isUserLoading, firestore, auth, storage } = useFirebase();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (isUserLoading) {
      return; // Wait until user auth state is resolved
    }
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    if (firestore) {
      const userDocRef = doc(firestore, "users", user.uid);
      const unsub = onSnapshot(userDocRef, (doc) => {
        if (doc.exists()) {
          setProfile({ uid: doc.id, ...doc.data() } as UserProfile);
        } else {
          setProfile(null);
        }
        setProfileLoading(false);
      }, (error) => {
        console.error("AuthProvider: Error fetching user profile:", error);
        const permissionError = new FirestorePermissionError({
          path: userDocRef.path,
          operation: 'get',
        });
        errorEmitter.emit('permission-error', permissionError);
        setProfile(null);
        setProfileLoading(false);
      });
      return () => unsub();
    }
  }, [user, isUserLoading, firestore]);

  return (
    <AuthContext.Provider value={{ user, profile, loading: isUserLoading || profileLoading, auth, db: firestore, storage }}>
      {children}
    </AuthContext.Provider>
  );
}
