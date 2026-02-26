import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCSVSQFvVZq55TciLzNoHifJUp754jIO4k",
  authDomain: "halbmarathon-pwa.firebaseapp.com",
  projectId: "halbmarathon-pwa",
  storageBucket: "halbmarathon-pwa.firebasestorage.app",
  messagingSenderId: "416871895562",
  appId: "1:416871895562:web:0e7d8bd0b5eeb686c885f3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

enableIndexedDbPersistence(db).catch(() => {
  // Silent fallback if persistence is not available in this runtime.
});

export { app, auth, db, firebaseConfig };
