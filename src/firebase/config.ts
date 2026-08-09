import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import appletConfig from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || appletConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || appletConfig.appId,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId || '(default)',
};

// Check if config is valid before initializing
const isConfigValid = !!firebaseConfig.apiKey && firebaseConfig.apiKey !== 'MY_FIREBASE_API_KEY';

let app: any;
let auth: any;
let db: any;
let storage: any;
let appCheck: any;

if (isConfigValid) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    const dbId = firebaseConfig.firestoreDatabaseId;
    db = getFirestore(app, dbId);
    storage = getStorage(app);

    // Firebase App Check (reCAPTCHA Enterprise provider).
    // The site key is supplied via VITE_FIREBASE_APP_CHECK_SITE_KEY so it can
    // be omitted for local/dev environments. When no key is provided, App
    // Check is skipped so the rest of the SDK still works normally.
    const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
    if (appCheckSiteKey) {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }
}

export { auth, db, storage, appCheck, isConfigValid };
export default app;