"use client";

import { createContext, useState, useEffect, ReactNode, useContext } from "react";
import { User, Auth } from "firebase/auth";
import { doc, onSnapshot, Firestore, Timestamp } from "firebase/firestore";
import { FirebaseStorage } from "firebase/storage";
import type { UserProfile } from "@/lib/types";
import { errorEmitter, FirestorePermissionError } from "@/firebase";

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  auth: Auth | null;
  db: Firestore | null;
  storage: FirebaseStorage | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

interface AuthProviderProps {
  children: ReactNode;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

export function AuthProvider({
  children,
  auth,
  db,
  storage,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Guard: Do not proceed if Firebase services are not ready.
    if (!auth || !db) {
      setLoading(false);
      return;
    }

    const unsubscribeAuth = auth.onAuthStateChanged(
      (firebaseUser) => {
        // This check ensures we only attempt to read Firestore for authenticated users.
        if (firebaseUser) {
          setUser(firebaseUser);
          const userDocRef = doc(db, "users", firebaseUser.uid);
          
          const unsubscribeProfile = onSnapshot(
            userDocRef,
            (docSnapshot) => {
              if (docSnapshot.exists()) {
                const profileData = docSnapshot.data();
                setProfile({
                  ...profileData,
                  uid: docSnapshot.id,
                  createdAt: profileData.createdAt as Timestamp,
                  updatedAt: profileData.updatedAt as Timestamp,
                  approvedAt: profileData.approvedAt as Timestamp | null,
                } as UserProfile);
              } else {
                setProfile(null);
                console.error(`No profile found for user ${firebaseUser.uid}`);
              }
              setLoading(false);
            },
            (error) => {
              console.error("Error fetching user profile:", error);
              const permissionError = new FirestorePermissionError({
                path: userDocRef.path,
                operation: "get",
              });
              errorEmitter.emit("permission-error", permissionError);
              setProfile(null);
              setLoading(false);
            }
          );
          return unsubscribeProfile; // Cleanup profile listener on user change
        } else {
          // User is signed out, clear all user-related state.
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      },
      (error) => {
        console.error("Auth state change error:", error);
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    );

    // Cleanup auth listener on component unmount
    return () => unsubscribeAuth();
  }, [auth, db]);

  const value = { user, profile, loading, auth, db, storage };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
