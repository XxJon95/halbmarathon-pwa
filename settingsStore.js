import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase.js";

export async function loadUserSettings(uid) {
  if (!uid) return null;

  const ref = doc(db, "users", uid);
  const snapshot = await getDoc(ref);
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveUserSettings(uid, settings) {
  if (!uid) {
    throw new Error("saveUserSettings: uid is required");
  }

  const ref = doc(db, "users", uid);
  await setDoc(
    ref,
    {
      ...settings,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}
