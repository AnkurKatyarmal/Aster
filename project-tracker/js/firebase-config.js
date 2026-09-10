/* ==========================================================================
   IDfy Project Tracker — firebase-config.js
   Fill this in with YOUR Firebase project's config (Project Settings ->
   General -> Your apps -> SDK setup and configuration -> Config).
   See README.md "Setting up Firebase" for the full walkthrough.

   Until you replace FIREBASE_CONFIG.apiKey below, the app runs in
   LOCAL MODE: no login, data saved only in this browser's localStorage.
   As soon as you fill in real values, the app switches to CLOUD MODE:
   Google sign-in + shared Firestore storage + the approval workflow.
   ========================================================================== */

var FIREBASE_CONFIG = {
  apiKey: "AIzaSyBIzmOCCLZ07NxhwpvtZLIRdseasfL63oY",
  authDomain: "github-storage-a9b4d.firebaseapp.com",
  projectId: "github-storage-a9b4d",
  storageBucket: "github-storage-a9b4d.firebasestorage.app",
  messagingSenderId: "813999434899",
  appId: "1:813999434899:web:b026a0a44ac04d0c047166"
};

// The very first sign-in problem: nobody can approve anyone if no admin
// exists yet. Any Google account listed here is auto-approved as Admin the
// moment it signs in for the first time — everyone else lands in "pending"
// until an admin approves them.
//
// IMPORTANT: this list must be copied EXACTLY into firestore.rules
// (the isBootstrapAdminEmail function) or the security rules will reject
// the admin's own first sign-in. Keep the two in sync.
var ADMIN_EMAILS = [
  "ankur.katyarmal@gmail.com"
];

// Detected automatically — do not edit.
var FIREBASE_ENABLED = FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" && !!FIREBASE_CONFIG.apiKey;
