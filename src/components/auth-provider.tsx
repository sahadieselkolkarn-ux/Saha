"use client";

import { createContext, useState, useEffect, ReactNode } from 'react';
import { User, Auth } from 'firebase/auth';
import { doc, onSnapshot, Firestore } from 'firebase/firestore';
import { FirebaseStorage } from 'firebase/storage';
import { useFirebase } from '@/firebase';
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
      const unsub = onSnapshot(doc(firestore, "users", user.uid), (doc) => {
        if (doc.exists()) {
          setProfile({ uid: doc.id, ...doc.data() } as UserProfile);
        } else {
          setProfile(null);
        }
        setProfileLoading(false);
      }, () => {
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
