import fs from "fs";
import path from "path";
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch
} from "firebase/firestore";

let firestoreInstance: Firestore | null = null;
let firebaseAppInstance: FirebaseApp | null = null;

// Hardcoded fallback config to ensure production deployments (like Render)
// always connect even if the local json is missing or in a different directory.
const FALLBACK_FIREBASE_CONFIG = {
  projectId: "gen-lang-client-0888312811",
  appId: "1:49143815687:web:a53835df7060d7212214a2",
  apiKey: "AIzaSyDhUlSjhSRjt62QWBcavVPrVQMEPKGSATM",
  authDomain: "gen-lang-client-0888312811.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-idmessenger-f100090e-06bf-46fb-b33c-007c84fc22d1",
  storageBucket: "gen-lang-client-0888312811.firebasestorage.app",
  messagingSenderId: "49143815687",
  measurementId: "",
  oAuthClientId: "49143815687-l0p7toaah4qlgcb5mtgdhd1g580nrlhq.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

export function getFirestoreClient(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;

  try {
    let config = FALLBACK_FIREBASE_CONFIG;
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      try {
        const loaded = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        if (loaded.apiKey && loaded.projectId) {
          config = loaded;
        }
      } catch (e) {
        console.warn("Failed to parse firebase-applet-config.json, using embedded config fallback:", e);
      }
    }

    const apps = getApps();
    firebaseAppInstance = apps.length === 0 ? initializeApp(config) : apps[0];

    const dbId = config.firestoreDatabaseId || "(default)";
    if (dbId && dbId !== "(default)") {
      firestoreInstance = getFirestore(firebaseAppInstance, dbId);
    } else {
      firestoreInstance = getFirestore(firebaseAppInstance);
    }

    console.log(`🔥 Firebase Firestore client initialized successfully for DB: ${dbId}`);
    return firestoreInstance;
  } catch (err) {
    console.error("❌ Client Firestore initialization error:", err);
    return null;
  }
}

// Deeply removes any undefined properties so Firestore doesn't reject them
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === undefined || obj === null) {
    return null as any;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForFirestore(item)) as any;
  }
  if (typeof obj === "object" && !(obj instanceof Date)) {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj as Record<string, any>)) {
      if (value !== undefined) {
        sanitized[key] = sanitizeForFirestore(value);
      }
    }
    return sanitized as T;
  }
  return obj;
}

export { collection, doc, getDocs, setDoc, writeBatch };
