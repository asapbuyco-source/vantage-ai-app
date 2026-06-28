import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache } from "firebase/firestore";

// Configuration using Vite Environment Variables with provided fallbacks
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
// Check if app is already initialized to avoid hot-reload errors
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Services
export const auth = getAuth(app);

// Modern persistent cache — single-tab (no tab manager needed for native Capacitor WebView)
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache()
  });
} catch (e) {
  // Already initialized (e.g., hot module replacement)
  firestoreDb = getFirestore(app);
}
export const db = firestoreDb;

export const enableFirestorePersistence = async () => {
  // Persistence is now automatically handled by initializeFirestore's persistentLocalCache.
  // This no-op preserves compatibility with any existing code that calls it.
};

// Log successful initialization
const apiKeyStatus = firebaseConfig.apiKey ? `Loaded (${firebaseConfig.apiKey.length} chars)` : "MISSING";
console.log(`Firebase initialized. Project: ${firebaseConfig.projectId}, API Key: ${apiKeyStatus}`);