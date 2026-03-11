'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';

/**
 * A central listener component that catches FirestorePermissionErrors 
 * emitted throughout the application.
 */
export function FirebaseErrorListener() {
  useEffect(() => {
    const unsubscribe = errorEmitter.on('permission-error', (error: any) => {
      // In development, we want to see the rich error overlay
      if (process.env.NODE_ENV === 'development') {
        throw error;
      } else {
        // In production, we log it to prevent crashing the entire app
        // but still allow the developer to see it in the console/logs
        console.error("Firestore Permission Error:", error.message, error.context);
      }
    });
    
    // Assume errorEmitter.on might return a cleanup function or we handle it via listeners array
    // Since our custom emitter is simple, we just leave it for the lifecycle of the app
  }, []);

  return null;
}
