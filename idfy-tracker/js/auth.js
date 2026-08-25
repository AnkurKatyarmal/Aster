/* ==========================================================================
   IDfy Project Tracker — auth.js
   Google sign-in via Firebase Auth, user status/role in Firestore, and the
   admin approval queue. Only active when FIREBASE_ENABLED is true.
   ========================================================================== */

var Auth = (function () {
  "use strict";

  var ROLES = ["admin", "editor", "viewer", "viewer_download"];
  var ROLE_LABELS = {
    admin: "Admin",
    editor: "Editor",
    viewer: "Viewer",
    viewer_download: "Viewer + Download"
  };

  var fbApp = null, fbAuth = null, db = null;
  var currentUser = null;      // Firebase auth user object
  var currentProfile = null;   // Firestore users/{uid} doc data
  var listeners = [];          // callbacks fired on any auth/profile change
  var pendingCountListeners = [];
  var unsubProfile = null;
  var unsubPendingCount = null;

  function isEnabled() { return !!window.FIREBASE_ENABLED; }

  function init() {
    if (!isEnabled()) return;
    fbApp = firebase.initializeApp(window.FIREBASE_CONFIG);
    fbAuth = firebase.auth();
    db = firebase.firestore();

    fbAuth.onAuthStateChanged(function (user) {
      currentUser = user;
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      if (unsubPendingCount) { unsubPendingCount(); unsubPendingCount = null; }

      if (!user) {
        currentProfile = null;
        notify();
        return;
      }

      var ref = db.collection("users").doc(user.uid);
      ref.get().then(function (doc) {
        if (!doc.exists) {
          var isBootstrapAdmin = (window.ADMIN_EMAILS || []).indexOf(user.email) !== -1;
          var profile = {
            email: user.email,
            displayName: user.displayName || user.email,
            photoURL: user.photoURL || "",
            status: isBootstrapAdmin ? "approved" : "pending",
            role: isBootstrapAdmin ? "admin" : "viewer",
            requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedAt: isBootstrapAdmin ? firebase.firestore.FieldValue.serverTimestamp() : null,
            approvedBy: isBootstrapAdmin ? "bootstrap" : null
          };
          return ref.set(profile);
        }
      }).then(function () {
        // live-subscribe so approval reflects instantly without refresh
        unsubProfile = ref.onSnapshot(function (doc) {
          currentProfile = doc.exists ? doc.data() : null;
          notify();
          if (currentProfile && currentProfile.role === "admin" && currentProfile.status === "approved") {
            subscribePendingCount();
          }
        });
      });
    });
  }

  function subscribePendingCount() {
    if (unsubPendingCount) return;
    unsubPendingCount = db.collection("users").where("status", "==", "pending")
      .onSnapshot(function (snap) {
        pendingCountListeners.forEach(function (cb) { cb(snap.size); });
      });
  }

  function onChange(cb) { listeners.push(cb); }
  function onPendingCountChange(cb) { pendingCountListeners.push(cb); }
  function notify() { listeners.forEach(function (cb) { cb(state()); }); }

  function state() {
    return {
      enabled: isEnabled(),
      user: currentUser,
      profile: currentProfile,
      signedIn: !!currentUser,
      isApproved: !!(currentProfile && currentProfile.status === "approved"),
      isPending: !!(currentProfile && currentProfile.status === "pending"),
      isRejected: !!(currentProfile && currentProfile.status === "rejected"),
      role: currentProfile ? currentProfile.role : null,
      canEdit: !!(currentProfile && currentProfile.status === "approved" && (currentProfile.role === "admin" || currentProfile.role === "editor")),
      canDownload: !!(currentProfile && currentProfile.status === "approved" && currentProfile.role !== "viewer") ,
      isAdmin: !!(currentProfile && currentProfile.status === "approved" && currentProfile.role === "admin")
    };
  }

  function signIn() {
    var provider = new firebase.auth.GoogleAuthProvider();
    return fbAuth.signInWithPopup(provider);
  }

  function signOut() {
    return fbAuth.signOut();
  }

  // ---- admin approval queue ----
  function listPending(callback) {
    db.collection("users").where("status", "==", "pending").get().then(function (snap) {
      var rows = [];
      snap.forEach(function (doc) { rows.push(Object.assign({ uid: doc.id }, doc.data())); });
      callback(rows);
    });
  }

  function listAllUsers(callback) {
    db.collection("users").get().then(function (snap) {
      var rows = [];
      snap.forEach(function (doc) { rows.push(Object.assign({ uid: doc.id }, doc.data())); });
      callback(rows);
    });
  }

  function approveUser(uid, role) {
    return db.collection("users").doc(uid).update({
      status: "approved",
      role: role,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: currentUser ? currentUser.email : "unknown"
    });
  }

  function rejectUser(uid) {
    return db.collection("users").doc(uid).update({ status: "rejected" });
  }

  function changeRole(uid, role) {
    return db.collection("users").doc(uid).update({ role: role });
  }

  function revokeUser(uid) {
    return db.collection("users").doc(uid).update({ status: "pending" });
  }

  return {
    ROLES: ROLES,
    ROLE_LABELS: ROLE_LABELS,
    isEnabled: isEnabled,
    init: init,
    onChange: onChange,
    onPendingCountChange: onPendingCountChange,
    state: state,
    signIn: signIn,
    signOut: signOut,
    listPending: listPending,
    listAllUsers: listAllUsers,
    approveUser: approveUser,
    rejectUser: rejectUser,
    changeRole: changeRole,
    revokeUser: revokeUser,
    getDb: function () { return db; }
  };
})();
