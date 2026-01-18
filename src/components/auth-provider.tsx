"use client";

import { createContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { onAuthStateChanged, User, getAuth, Auth } from 'firebase/auth';
import { doc, onSnapshot, getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { app } from '@/lib/firebase'; // We still need the app instance
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
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const { auth, db, storage } = useMemo(() => {
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);
    return { auth, db, storage };
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (!user) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [auth]);

  useEffect(() => {
    if (user && db) {
      const unsub = onSnapshot(doc(db, "users", user.uid), (doc) => {
        if (doc.exists()) {
          setProfile({ uid: doc.id, ...doc.data() } as UserProfile);
        } else {
          setProfile(null);
        }
        setLoading(false);
      });
      return () => unsub();
    }
  }, [user, db]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, auth, db, storage }}>
      {children}
    </AuthContext.Provider>
  );
}
