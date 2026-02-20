'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore } from 'firebase/firestore';
import { Auth } from 'firebase/auth';

interface FirebaseContextType {
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
}

const FirebaseContext = createContext<FirebaseContextType>({
  firebaseApp: null,
  firestore: null,
  auth: null,
});

export const FirebaseProvider = ({ 
  children, 
  firebaseApp, 
  firestore, 
  auth 
}: { 
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
}) => {
  return (
    <FirebaseContext.Provider value={{ firebaseApp, firestore, auth }}>
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

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  return {
    app: context.firebaseApp,
    db: context.firestore,
    auth: context.auth,
  };
};
