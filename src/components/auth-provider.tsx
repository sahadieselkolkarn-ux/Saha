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
      // Don't change profileLoading, just wait for user state.
      // It's already true by default.
      return;
    }
    if (!user) {
      // No user, so no profile to load. We are done loading.
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    
    // We have a user. Now we need firestore to fetch their profile.
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
    } else {
      // This is the case the user mentioned. User is loaded, but firestore is not.
      // This is an initialization issue. We should stop loading to not hang the app.
      console.warn("AuthProvider: Firestore instance not available. Cannot fetch user profile.");
      setProfile(null); 
      setProfileLoading(false);
    }
  }, [user, isUserLoading, firestore]);

  return (
    <AuthContext.Provider value={{ user, profile, loading: isUserLoading || profileLoading, auth, db: firestore, storage }}>
      {children}
    </AuthContext.Provider>
  );
}
