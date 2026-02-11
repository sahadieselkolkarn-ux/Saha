'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';

/**
 * A central listener component that catches FirestorePermissionErrors 
 * emitted throughout the application and re-throws them to trigger 
 * the Next.js development error overlay with full context.
 */
export function FirebaseErrorListener() {
  useEffect(() => {
    errorEmitter.on('permission-error', (error: any) => {
      // Re-throwing the error ensures it's caught by the global error handler
      // and displayed in the development overlay with the rich context we provided.
      throw error;
    });
  }, []);

  return null;
}
