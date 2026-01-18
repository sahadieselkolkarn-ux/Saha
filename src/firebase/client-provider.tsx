'use client';

import React, { useMemo, type ReactNode } from 'react';
import { AuthProvider } from '@/context/auth-context';
import { initializeFirebase } from '@/firebase';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';


interface FirebaseClientProviderProps {
  children: ReactNode;
}

export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const firebaseServices = useMemo(() => {
    // Initialize Firebase on the client side, once per component mount.
    return initializeFirebase();
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <AuthProvider
      auth={firebaseServices.auth}
      db={firebaseServices.firestore}
      storage={firebaseServices.storage}
    >
      <FirebaseErrorListener />
      {children}
    </AuthProvider>
  );
}
