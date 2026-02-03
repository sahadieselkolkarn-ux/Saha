
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import type { UserProfile } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: Error | null;
  signIn: (email: string, pass: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  authError: null,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { auth, db } = useFirebase();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<Error | null>(null);

  useEffect(() => {
    if (!auth || !db) {
      // Firebase services not ready yet.
      const timer = setTimeout(() => {
        if(!auth || !db) {
            setAuthError(new Error("Firebase services could not be initialized. Please check your connection and configuration."));
            setLoading(false);
        }
      }, 10000); // Wait up to 10s for initialization
      return () => clearTimeout(timer);
    }
    setAuthError(null);

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
      }
    });
    
    return () => unsubscribeAuth();
  }, [auth, db]);

  useEffect(() => {
    if (!db || !user) {
        return;
    };
    
    setLoading(true);
    const profileDocRef = doc(db, "users", user.uid);
    const unsubscribeProfile = onSnapshot(profileDocRef, 
        (docSnap) => {
            if (docSnap.exists()) {
                setProfile({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
            } else {
                console.warn("User profile not found in Firestore for UID:", user.uid);
                setProfile(null);
            }
            setLoading(false);
        },
        (error) => {
            console.error("Error fetching user profile:", error);
            // Don't set error globally here, just stop loading
            setProfile(null);
            setLoading(false);
        }
    );

    return () => unsubscribeProfile();

  }, [user, db]);


  const signIn = (email: string, pass: string) => {
    if (!auth) throw new Error("Authentication service is not available.");
    return signInWithEmailAndPassword(auth, email, pass);
  };

  const signOutUser = async () => {
    if (!auth) throw new Error("Authentication service is not available.");
    setLoading(true);
    try {
        await signOut(auth);
    } finally {
        setLoading(false);
    }
  };

  const value = { user, profile, loading, authError, signIn, signOut: signOutUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  return useContext(AuthContext);
};
