'use client';

import React, { useMemo, type ReactNode } from 'react';
import { initializeFirebase } from '@/firebase/init';
import { FirebaseProvider } from './provider';
import { FirebaseErrorListener } from '@/components/firebase-error-listener';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => {
    return initializeFirebase();
  }, []);

  if (!services.firebaseApp || !services.firestore || !services.auth) {
    return null;
  }

  return (
    <FirebaseProvider 
      firebaseApp={services.firebaseApp} 
      firestore={services.firestore} 
      auth={services.auth}
    >
      <FirebaseErrorListener />
      {children}
    </FirebaseProvider>
  );
}
