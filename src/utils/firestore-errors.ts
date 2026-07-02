import { auth } from '../firebase/config';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // Map Firebase errors to user friendly messages
  let message = 'An unexpected database error occurred.';
  const firebaseError = error as any;
  
  if (firebaseError.code === 'permission-denied') {
    message = 'Permission denied. You do not have access to this resource or the data is invalid.';
  } else if (firebaseError.code === 'unavailable') {
    message = 'The service is currently unavailable. Please check your internet connection.';
  } else if (firebaseError.code === 'not-found') {
    message = 'The requested document was not found.';
  } else if (firebaseError.code === 'already-exists') {
    message = 'The document you are trying to create already exists.';
  }
  
  const userError = new Error(message);
  (userError as any).details = errInfo;
  throw userError;
}
