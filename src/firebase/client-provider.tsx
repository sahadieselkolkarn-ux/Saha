'use client';

import React, { useMemo, type ReactNode, createContext, useContext } from 'react';
import { initializeFirebase } from '@/firebase/init';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import type { Auth } from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';
import { FirebaseErrorListener } from '@/components/firebase-error-listener';

interface FirebaseServices {
  db: Firestore | null;
  storage: FirebaseStorage | null;
  auth: Auth | null;
  firebaseApp: FirebaseApp | null;
}

const FirebaseContext = createContext<FirebaseServices>({ 
  db: null, 
  storage: null, 
  auth: null,
  firebaseApp: null
});

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => {
    return initializeFirebase();
  }, []);

  return (
    <FirebaseContext.Provider value={{ 
      db: services.firestore, 
      storage: services.storage, 
      auth: services.auth,
      firebaseApp: services.firebaseApp
    }}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
}

export const useFirebase = () => {
    const context = useContext(FirebaseContext);
    if (!context) {
        throw new Error('useFirebase must be used within a FirebaseClientProvider');
    }
    return context;
}
