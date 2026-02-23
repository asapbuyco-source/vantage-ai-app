import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Configuration using Vite Environment Variables with provided fallbacks
const firebaseConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || "AIzaSyCVDmeMSReJ6MCpMW95LIGf-SxtTjTgWWY",
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || "vantage-ai-4d17d.firebaseapp.com",
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || "vantage-ai-4d17d",
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || "vantage-ai-4d17d.firebasestorage.app",
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "459344360478",
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || "1:459344360478:web:88cb257dea87a19177ea0f",
  measurementId: import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID || "G-NM09XQ8QM5"
};

// Initialize Firebase
// Check if app is already initialized to avoid hot-reload errors
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Log successful initialization
console.log("Firebase initialized with project:", firebaseConfig.projectId);