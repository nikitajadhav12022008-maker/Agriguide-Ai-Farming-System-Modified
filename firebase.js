/* ════════════════════════════════════════════════════════════
   AgriGuide Pro — firebase.js
   Firebase Authentication + Firestore integration · 2025

   SETUP INSTRUCTIONS:
   1. Go to https://console.firebase.google.com
   2. Create a new project called "agriguide-pro"
   3. Click "Add app" → Web app
   4. Copy your config values below
   5. Enable Authentication → Google + Email/Password
   6. Enable Firestore Database (start in test mode)
════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ══════════════════════════════════════════════════════════
   🔧 PASTE YOUR FIREBASE CONFIG HERE
   Get this from: Firebase Console → Project Settings → Your apps
══════════════════════════════════════════════════════════ */
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

/* ── Initialize Firebase ───────────────────────────────── */
const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();

/* ── Flag: are we using Firebase or local-only mode? ───── */
const FIREBASE_CONFIGURED = firebaseConfig.apiKey !== "YOUR_API_KEY";

if (!FIREBASE_CONFIGURED) {
  console.warn(
    "⚠️ AgriGuide Pro: Firebase not configured.\n" +
    "Running in LOCAL MODE (localStorage only).\n" +
    "To enable cloud sync, add your Firebase config to firebase.js"
  );
}

/* ════════════════════════════════════════════════════════════
   AUTH STATE LISTENER
   Fires whenever a user logs in or out.
   Syncs with the main app's currentUser state.
════════════════════════════════════════════════════════════ */
onAuthStateChanged(auth, async (firebaseUser) => {
  if (!FIREBASE_CONFIGURED) return;

  if (firebaseUser) {
    // User is signed in — sync to app state
    window.currentUser = {
      uid:   firebaseUser.uid,
      name:  firebaseUser.displayName || nameFromEmail(firebaseUser.email),
      email: firebaseUser.email,
      photo: firebaseUser.photoURL || null
    };
    localStorage.setItem('agri_user', JSON.stringify(window.currentUser));

    // Load user data from Firestore
    await loadUserDataFromFirestore(firebaseUser.uid);

    // Update UI if app is already showing
    if (typeof updateUserUI === 'function') updateUserUI();

  } else {
    // User signed out
    window.currentUser = null;
    localStorage.removeItem('agri_user');
  }
});

/* ════════════════════════════════════════════════════════════
   FIREBASE AUTH FUNCTIONS
   These override the stub functions in script.js when Firebase
   is properly configured.
════════════════════════════════════════════════════════════ */

/** Email/Password Sign In */
async function firebaseLogin(email, password) {
  if (!FIREBASE_CONFIGURED) return false;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return true;
  } catch (err) {
    const msg = getAuthErrorMessage(err.code);
    if (typeof showToast === 'function') showToast(`⚠️ ${msg}`);
    return false;
  }
}

/** Email/Password Sign Up */
async function firebaseSignup(name, email, password) {
  if (!FIREBASE_CONFIGURED) return false;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Set display name
    await updateProfile(cred.user, { displayName: name });
    // Create Firestore user document
    await createUserDocument(cred.user.uid, { name, email });
    return true;
  } catch (err) {
    const msg = getAuthErrorMessage(err.code);
    if (typeof showToast === 'function') showToast(`⚠️ ${msg}`);
    return false;
  }
}

/** Google Sign In */
async function firebaseGoogleLogin() {
  if (!FIREBASE_CONFIGURED) return false;
  try {
    const result = await signInWithPopup(auth, provider);
    const user   = result.user;
    // Create user doc if first time
    const userRef = doc(db, 'users', user.uid);
    const snap    = await getDoc(userRef);
    if (!snap.exists()) {
      await createUserDocument(user.uid, {
        name:  user.displayName,
        email: user.email,
        photo: user.photoURL
      });
    }
    return true;
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      if (typeof showToast === 'function') showToast('⚠️ Google sign-in failed. Please try again.');
    }
    return false;
  }
}

/** Sign Out */
async function firebaseLogout() {
  if (!FIREBASE_CONFIGURED) return;
  try {
    await signOut(auth);
  } catch (err) {
    console.error('Sign out error:', err);
  }
}

/* ════════════════════════════════════════════════════════════
   FIRESTORE — USER DATA
════════════════════════════════════════════════════════════ */

/** Create a new user document in Firestore */
async function createUserDocument(uid, data) {
  try {
    await setDoc(doc(db, 'users', uid), {
      name:      data.name,
      email:     data.email,
      photo:     data.photo || null,
      createdAt: serverTimestamp(),
      plan:      'free'
    });
  } catch (err) {
    console.error('Error creating user document:', err);
  }
}

/** Load user's crops and scan history from Firestore */
async function loadUserDataFromFirestore(uid) {
  if (!FIREBASE_CONFIGURED) return;
  try {
    // Load crops
    const cropsSnap = await getDocs(
      query(collection(db, 'users', uid, 'crops'), orderBy('addedAt', 'desc'))
    );
    if (!cropsSnap.empty) {
      window.cropRegistry = cropsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      localStorage.setItem('agri_crops', JSON.stringify(window.cropRegistry));
    }

    // Load scan history
    const historySnap = await getDocs(
      query(collection(db, 'users', uid, 'scanHistory'), orderBy('createdAt', 'desc'))
    );
    if (!historySnap.empty) {
      window.scanHistory = historySnap.docs.map(d => ({ id: d.id, ...d.data() }));
      localStorage.setItem('agri_history', JSON.stringify(window.scanHistory));
    }
  } catch (err) {
    console.warn('Could not load Firestore data, using localStorage:', err.message);
  }
}

/** Save a crop to Firestore */
async function saveCropToFirestore(uid, crop) {
  if (!FIREBASE_CONFIGURED || !uid) return;
  try {
    await addDoc(collection(db, 'users', uid, 'crops'), {
      name:    crop.name,
      price:   crop.price,
      addedOn: crop.addedOn,
      addedAt: serverTimestamp()
    });
  } catch (err) {
    console.warn('Could not save crop to Firestore:', err.message);
  }
}

/** Delete a crop from Firestore */
async function deleteCropFromFirestore(uid, cropId) {
  if (!FIREBASE_CONFIGURED || !uid) return;
  try {
    await deleteDoc(doc(db, 'users', uid, 'crops', String(cropId)));
  } catch (err) {
    console.warn('Could not delete crop from Firestore:', err.message);
  }
}

/** Save a scan result to Firestore */
async function saveScanToFirestore(uid, scan) {
  if (!FIREBASE_CONFIGURED || !uid) return;
  try {
    await addDoc(collection(db, 'users', uid, 'scanHistory'), {
      summary:   scan.summary,
      full:      scan.full,
      date:      scan.date,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.warn('Could not save scan to Firestore:', err.message);
  }
}

/* ════════════════════════════════════════════════════════════
   HELPER FUNCTIONS
════════════════════════════════════════════════════════════ */

function nameFromEmail(email) {
  return email.split('@')[0]
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getAuthErrorMessage(code) {
  const messages = {
    'auth/user-not-found':       'No account found with this email.',
    'auth/wrong-password':       'Incorrect password. Please try again.',
    'auth/email-already-in-use': 'An account already exists with this email.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/too-many-requests':    'Too many attempts. Please wait and try again.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    'auth/invalid-credential':   'Invalid email or password. Please try again.',
  };
  return messages[code] || 'Authentication failed. Please try again.';
}

/* ════════════════════════════════════════════════════════════
   EXPORT — expose Firebase functions to script.js
════════════════════════════════════════════════════════════ */
window.FB = {
  login:           firebaseLogin,
  signup:          firebaseSignup,
  googleLogin:     firebaseGoogleLogin,
  logout:          firebaseLogout,
  saveCrop:        saveCropToFirestore,
  deleteCrop:      deleteCropFromFirestore,
  saveScan:        saveScanToFirestore,
  isConfigured:    FIREBASE_CONFIGURED,
  auth,
  db
};
