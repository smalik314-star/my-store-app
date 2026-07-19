import { auth } from '../firebase/config';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  SNAPSHOT = 'snapshot_received',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType | string;
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

function sanitizeForLogging(obj: any): any {
  if (!obj) return obj;
  try {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
      if (key === 'items' && Array.isArray(value)) {
        return `[Array of ${value.length} items]`;
      }
      if (typeof value === 'string' && value.length > 500) {
        return value.substring(0, 500) + '... (truncated)';
      }
      return value;
    }));
  } catch (e) {
    return '[Unserializable details]';
  }
}

export function logFirestoreOperation(
  operationType: OperationType | string,
  path: string,
  status: 'pending' | 'success' | 'failure',
  details?: any,
  error?: any
) {
  // Never expose customer, invoice, tenant or auth metadata in production consoles.
  if (!import.meta.env.DEV) return;
  const logData = {
    timestamp: new Date().toISOString(),
    operationType,
    path,
    status,
    userId: auth?.currentUser?.uid || 'anonymous/none',
    userEmailVerified: auth?.currentUser?.emailVerified || false,
    isOnline: navigator.onLine,
    details: details ? sanitizeForLogging(details) : undefined,
    error: error ? (error instanceof Error ? error.message : String(error)) : undefined,
    errorStack: error && error instanceof Error ? error.stack : undefined,
  };

  if (status === 'failure') {
    console.error(`[Firestore Error] [${operationType.toUpperCase()}] on [${path}]:`, JSON.stringify(logData, null, 2));
  } else {
    console.log(`[Firestore Log] [${operationType.toUpperCase()}] on [${path}] [Status: ${status.toUpperCase()}]:`, JSON.stringify(logData, null, 2));
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType | string, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  
  // Log failure through logFirestoreOperation
  logFirestoreOperation(operationType, path || 'unknown', 'failure', null, error);
  
  // Map Firebase errors to user friendly messages
  let message = 'An unexpected database error occurred.';
  const firebaseError = error as any;
  
  if (firebaseError && firebaseError.code) {
    if (firebaseError.code === 'permission-denied') {
      message = 'Permission denied. You do not have access to this resource or the data is invalid.';
    } else if (firebaseError.code === 'unavailable') {
      message = 'The service is currently unavailable. Please check your internet connection.';
    } else if (firebaseError.code === 'not-found') {
      message = 'The requested document was not found.';
    } else if (firebaseError.code === 'already-exists') {
      message = 'The document you are trying to create already exists.';
    }
  } else if (error instanceof Error) {
    message = error.message;
  }
  
  const userError = new Error(message);
  (userError as any).details = errInfo;
  throw userError;
}
