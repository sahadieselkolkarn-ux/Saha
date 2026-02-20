import { initializeFirebase } from './init';
import {
  FirebaseProvider,
  useFirebase,
  useFirestore,
  useFirebaseApp,
  useFirebaseAuth,
} from './provider';
import { FirebaseClientProvider } from './client-provider';
import { useCollection, type WithId } from './firestore/use-collection';
import { useDoc } from './firestore/use-doc';
import { useUser } from './auth/use-user';

export {
  initializeFirebase,
  FirebaseProvider,
  FirebaseClientProvider,
  useFirebase,
  useFirestore,
  useFirebaseApp,
  useFirebaseAuth,
  useCollection,
  useDoc,
  useUser,
};

export type { WithId };