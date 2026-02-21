'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore } from 'firebase/firestore';
import { Auth } from 'firebase/auth';
import { FirebaseStorage } from 'firebase/storage';

interface FirebaseContextType {
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
  storage: FirebaseStorage | null;
}

const FirebaseContext = createContext<FirebaseContextType>({
  firebaseApp: null,
  firestore: null,
  auth: null,
  storage: null,
});

export const FirebaseProvider = ({ 
  children, 
  firebaseApp, 
  firestore, 
  auth,
  storage
}: { 
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  storage: FirebaseStorage;
}) => {
  return (
    <FirebaseContext.Provider value={{ firebaseApp, firestore, auth, storage }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebaseApp = () => {
  const context = useContext(FirebaseContext);
  return context.firebaseApp;
};

export const useFirestore = () => {
  const context = useContext(FirebaseContext).firestore;
  if (!context) throw new Error("useFirestore must be used within a FirebaseProvider");
  return context;
};

export const useFirebaseAuth = () => {
  const context = useContext(FirebaseContext).auth;
  if (!context) throw new Error("useFirebaseAuth must be used within a FirebaseProvider");
  return context;
};

export const useFirebaseStorage = () => {
  const context = useContext(FirebaseContext).storage;
  if (!context) throw new Error("useFirebaseStorage must be used within a FirebaseProvider");
  return context;
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  return {
    app: context.firebaseApp,
    db: context.firestore,
    auth: context.auth,
    storage: context.storage,
  };
};
