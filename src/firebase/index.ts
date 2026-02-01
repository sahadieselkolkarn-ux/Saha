'use client';

// This is the main barrel file for Firebase-related utilities and hooks.

// Export the main context provider and hook
export { FirebaseClientProvider, useFirebase } from './client-provider';

// Export individual hooks for easy access
export { useCollection } from './firestore/use-collection';
export { useDoc } from './firestore/use-doc';

// Note: The original 'initializeFirebase' function has been moved to 'firebase/init.ts'
// to break a circular dependency. It is now used internally by FirebaseClientProvider
// and generally should not be called directly from app components.
