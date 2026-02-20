import { initializeFirebase } from './init';
import { FirebaseProvider, useFirebase, useFirebaseApp, useFirestore, useFirebaseAuth as useAuth } from './provider';
import { FirebaseClientProvider } from './client-provider';
import { useCollection, WithId } from './firestore/use-collection';
import { useDoc } from './firestore/use-doc';
import { useUser } from './auth/use-user';

export {
  initializeFirebase,
  FirebaseProvider,
  FirebaseClientProvider,
  useFirebase,
  useFirebaseApp,
  useFirestore,
  useAuth,
  useCollection,
  useDoc,
  useUser,
  type WithId,
};
