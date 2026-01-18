'use client';

import React, { useMemo, type ReactNode, createContext, useContext } from 'react';
import { initializeFirebase } from '@/firebase';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';

interface FirebaseServices {
  db: Firestore | null;
  storage: FirebaseStorage | null;
}

const FirebaseContext = createContext<FirebaseServices>({ db: null, storage: null });

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => {
    return initializeFirebase();
  }, []);

  return (
    <FirebaseContext.Provider value={{ db: services.firestore, storage: services.storage }}>
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
