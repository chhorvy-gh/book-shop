// The Firebase app, Auth and Firestore, made once in the browser.
// Settings come from .env.local (see .env.example). With NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true, or no project set,
// everything talks to the local emulators (npm run emulators) instead of the real project.
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

export const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" || !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

// The emulators always run as the demo project (npm run emulators), so nothing can reach the real one by mistake.
const config = USE_EMULATORS
  ? { apiKey: "demo-key", authDomain: "demo-salebook.firebaseapp.com", projectId: "demo-salebook" }
  : {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
// The project's Firestore database; empty = the usual "(default)".
const DATABASE_ID = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "(default)";

let made: { app: FirebaseApp; auth: Auth; db: Firestore } | null = null;

// Browser only: call from effects and event handlers, never while rendering on the server.
export function firebase() {
  if (made) return made;
  const app = getApps()[0] ?? initializeApp(config);
  const auth = getAuth(app);
  // Orders and notes are kept on the device too, so the pages open at once and a phone can keep typing with no signal;
  // changes made offline are sent when the connection is back.
  // ignoreUndefinedProperties: an optional field left undefined (a week without an end date) is simply not written.
  let db: Firestore;
  try {
    db = initializeFirestore(
      app,
      { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), ignoreUndefinedProperties: true },
      DATABASE_ID,
    );
  } catch {
    db = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true }, DATABASE_ID);
  }
  if (USE_EMULATORS) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8085);
    // Lets automated tests sign in without the Google window. Only ever with the emulators.
    (window as unknown as { __salebookTestSignIn?: (email: string) => Promise<unknown> }).__salebookTestSignIn = (email: string) =>
      signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
  }
  made = { app, auth, db };
  return made;
}
