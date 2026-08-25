/* ==========================================================================
   IDfy Project Tracker — auth.js
   Google sign-in via Firebase Auth, user status/role in Firestore, the
   admin approval queue for new sign-ins, and the maker-checker pending
   CHANGES queue (for Interns — content edits, not sign-in access).
   Only active when FIREBASE_ENABLED is true.
   ========================================================================== */

var Auth = (function () {
  "use strict";

  // admin        — full control, edits any project, approves any pending change, manages users
  // member       — a team member: creates/edits/deletes only projects they own, no approval needed
  // intern       — can propose new projects / edits / activities, but every change needs
  //                approval from an admin OR that project's owner before it goes live
  // viewer_download — read-only everywhere, can generate/download reports and export data
  // viewer       — read-only, no downloads
  var ROLES = ["admin", "member", "intern", "viewer_download", "viewer"];
  var ROLE_LABELS = {
    admin: "Admin",
    member: "Team Member",
    intern: "Intern (needs approval)",
    viewer_download: "Viewer + Download",
    viewer: "Viewer"
  };

  var fbApp = null, fbAuth = null, db = null;
  var currentUser = null;      // Firebase auth user object
  var currentProfile = null;   // Firestore users/{uid} doc data
  var listeners = [];          // callbacks fired on any auth/profile change
  var pendingUserCountListeners = [];   // new sign-ins awaiting approval
  var pendingChangeCountListeners = []; // content edits awaiting approval
  var unsubProfile = null;
  var unsubPendingUserCount = null;
  var unsubPendingChangeCount = null;

  function isEnabled() { return !!window.FIREBASE_ENABLED; }

  function init() {
    if (!isEnabled()) return;
    fbApp = firebase.initializeApp(window.FIREBASE_CONFIG);
    fbAuth = firebase.auth();
    db = firebase.firestore();

    fbAuth.onAuthStateChanged(function (user) {
      currentUser = user;
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      if (unsubPendingUserCount) { unsubPendingUserCount(); unsubPendingUserCount = null; }
      if (unsubPendingChangeCount) { unsubPendingChangeCount(); unsubPendingChangeCount = null; }

      if (!user) {
        currentProfile = null;
        notify();
        return;
      }

      var ref = db.collection("users").doc(user.uid);
      ref.get().then(function (doc) {
        if (!doc.exists) {
          var isBootstrapAdmin = (window.ADMIN_EMAILS || []).indexOf(user.email) !== -1;
          if (isBootstrapAdmin) {
            return ref.set({
              email: user.email, displayName: user.displayName || user.email, photoURL: user.photoURL || "",
              status: "approved", role: "admin",
              requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
              approvedAt: firebase.firestore.FieldValue.serverTimestamp(), approvedBy: "bootstrap"
            });
          }
          return db.collection("invites").doc(user.email.toLowerCase().trim()).get().then(function (inviteDoc) {
            if (inviteDoc.exists) {
              var inv = inviteDoc.data();
              return ref.set({
                email: user.email, displayName: user.displayName || user.email, photoURL: user.photoURL || "",
                status: "approved", role: inv.role,
                requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
                approvedAt: firebase.firestore.FieldValue.serverTimestamp(), approvedBy: "invite:" + (inv.invitedBy || "admin")
              });
            }
            return ref.set({
              email: user.email, displayName: user.displayName || user.email, photoURL: user.photoURL || "",
              status: "pending", role: "viewer",
              requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
              approvedAt: null, approvedBy: null
            });
          });
        }
      }).then(function () {
        // live-subscribe so approval reflects instantly without refresh
        unsubProfile = ref.onSnapshot(function (doc) {
          currentProfile = doc.exists ? doc.data() : null;
          notify();
          if (currentProfile && currentProfile.status === "approved") {
            if (currentProfile.role === "admin") subscribePendingUserCount();
            subscribePendingChangeCount();
          }
        });
      });
    });
  }

  function subscribePendingUserCount() {
    if (unsubPendingUserCount) return;
    unsubPendingUserCount = db.collection("users").where("status", "==", "pending")
      .onSnapshot(function (snap) {
        pendingUserCountListeners.forEach(function (cb) { cb(snap.size); });
      });
  }

  // Admin sees a count of ALL pending changes; a member sees only changes
  // proposed against projects they own (routed via targetOwnerEmail).
  function subscribePendingChangeCount() {
    if (unsubPendingChangeCount || !currentProfile) return;
    var q;
    if (currentProfile.role === "admin") {
      q = db.collection("pendingChanges").where("status", "==", "pending");
    } else if (currentProfile.role === "member") {
      q = db.collection("pendingChanges").where("status", "==", "pending").where("targetOwnerEmail", "==", currentUser.email);
    } else {
      return; // interns/viewers don't get an approval-queue badge
    }
    unsubPendingChangeCount = q.onSnapshot(function (snap) {
      pendingChangeCountListeners.forEach(function (cb) { cb(snap.size); });
    }, function (err) { console.error("pendingChanges count subscribe error", err); });
  }

  function onChange(cb) { listeners.push(cb); }
  function onPendingUserCountChange(cb) { pendingUserCountListeners.push(cb); }
  function onPendingChangeCountChange(cb) { pendingChangeCountListeners.push(cb); }
  function notify() { listeners.forEach(function (cb) { cb(state()); }); }

  function state() {
    var approved = !!(currentProfile && currentProfile.status === "approved");
    var role = currentProfile ? currentProfile.role : null;
    return {
      enabled: isEnabled(),
      user: currentUser,
      profile: currentProfile,
      email: currentUser ? currentUser.email : null,
      signedIn: !!currentUser,
      isApproved: approved,
      isPending: !!(currentProfile && currentProfile.status === "pending"),
      isRejected: !!(currentProfile && currentProfile.status === "rejected"),
      role: role,
      isAdmin: approved && role === "admin",
      isMember: approved && role === "member",
      isIntern: approved && role === "intern",
      // "canAddProjects": can click + Add Project at all (creation always
      // goes live immediately for admin/member; for intern it becomes a
      // pending proposal — see App.perms() / project CRUD handlers).
      canAddProjects: approved && (role === "admin" || role === "member" || role === "intern"),
      canDownload: approved && (role === "admin" || role === "member" || role === "viewer_download"),
      canApprove: approved && (role === "admin" || role === "member")
    };
  }

  function signIn() {
    var provider = new firebase.auth.GoogleAuthProvider();
    return fbAuth.signInWithPopup(provider);
  }

  function signOut() {
    return fbAuth.signOut();
  }

  // ---- admin approval queue: new sign-ins ----
  function listPendingUsers(callback) {
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

  // Convenience: approved admins + members, for "assign an owner" pickers.
  function listOwnerCandidates(callback) {
    db.collection("users").where("status", "==", "approved").get().then(function (snap) {
      var rows = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        if (d.role === "admin" || d.role === "member") rows.push(Object.assign({ uid: doc.id }, d));
      });
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

  // ---- maker-checker: pending CONTENT changes (Intern submissions) ----
  // type: 'create_project' | 'edit_project' | 'delete_project' |
  //       'add_activity' | 'edit_activity' | 'delete_activity'
  function submitPendingChange(change) {
    var doc = Object.assign({
      submittedBy: currentUser.email,
      submittedByName: currentProfile.displayName,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: "pending",
      reviewedBy: null,
      reviewedAt: null
    }, change);
    return db.collection("pendingChanges").add(doc);
  }

  function listPendingChangesFor(profile, callback) {
    var q;
    if (profile.role === "admin") {
      q = db.collection("pendingChanges").orderBy("submittedAt", "desc");
    } else if (profile.role === "member") {
      q = db.collection("pendingChanges").where("targetOwnerEmail", "==", currentUser.email);
    } else {
      // intern (or anyone else): only their own submission history
      q = db.collection("pendingChanges").where("submittedBy", "==", currentUser.email);
    }
    return q.onSnapshot(function (snap) {
      var rows = [];
      snap.forEach(function (doc) { rows.push(Object.assign({ id: doc.id }, doc.data())); });
      if (profile.role === "member") rows.sort(function (a, b) { return (b.submittedAt ? b.submittedAt.toMillis() : 0) - (a.submittedAt ? a.submittedAt.toMillis() : 0); });
      callback(rows);
    }, function (err) { console.error("listPendingChangesFor error", err); callback([]); });
  }

  function markChangeReviewed(changeId, statusValue) {
    return db.collection("pendingChanges").doc(changeId).update({
      status: statusValue,
      reviewedBy: currentUser.email,
      reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  // ---- invites: pre-approve someone before they ever sign in ----
  function createInvite(email, role) {
    var id = email.toLowerCase().trim();
    return db.collection("invites").doc(id).set({
      email: id,
      role: role,
      invitedBy: currentUser ? currentUser.email : "unknown",
      invitedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  function listInvites(callback) {
    db.collection("invites").get().then(function (snap) {
      var rows = [];
      snap.forEach(function (doc) { rows.push(Object.assign({ id: doc.id }, doc.data())); });
      callback(rows);
    });
  }

  function cancelInvite(email) {
    return db.collection("invites").doc(email.toLowerCase().trim()).delete();
  }

  return {
    ROLES: ROLES,
    ROLE_LABELS: ROLE_LABELS,
    isEnabled: isEnabled,
    init: init,
    onChange: onChange,
    onPendingUserCountChange: onPendingUserCountChange,
    onPendingChangeCountChange: onPendingChangeCountChange,
    state: state,
    signIn: signIn,
    signOut: signOut,
    listPendingUsers: listPendingUsers,
    listAllUsers: listAllUsers,
    listOwnerCandidates: listOwnerCandidates,
    approveUser: approveUser,
    rejectUser: rejectUser,
    changeRole: changeRole,
    revokeUser: revokeUser,
    submitPendingChange: submitPendingChange,
    listPendingChangesFor: listPendingChangesFor,
    markChangeReviewed: markChangeReviewed,
    createInvite: createInvite,
    listInvites: listInvites,
    cancelInvite: cancelInvite,
    getDb: function () { return db; }
  };
})();
