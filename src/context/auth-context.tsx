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
      if (!loading) setLoading(true);
      // Firebase services not ready yet. AuthProvider will re-render when they are.
      // We can set an error if it takes too long.
      const timer = setTimeout(() => {
        if(!auth || !db) {
            setAuthError(new Error("Firebase services could not be initialized. Please check your connection and configuration."));
            setLoading(false);
        }
      }, 5000);
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
  }, [auth, db, loading]);

  useEffect(() => {
    if (!db || !user) {
        // user is logged out, or db is not ready. Let the other effect handle loading state.
        return;
    };
    
    setLoading(true);
    const profileDocRef = doc(db, "users", user.uid);
    const unsubscribeProfile = onSnapshot(profileDocRef, 
        (doc) => {
            if (doc.exists()) {
                setProfile({ uid: doc.id, ...doc.data() } as UserProfile);
            } else {
                // This case can happen right after signup before profile is created.
                // Or if a user is deleted from DB but not from Auth.
                setProfile(null);
            }
            setLoading(false);
        },
        (error) => {
            console.error("Error fetching user profile:", error);
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

  const signOutUser = () => {
    if (!auth) throw new Error("Authentication service is not available.");
    return signOut(auth);
  };

  const value = { user, profile, loading, authError, signIn, signOut: signOutUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  return useContext(AuthContext);
};
