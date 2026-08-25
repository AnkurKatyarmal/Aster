/* ==========================================================================
   IDfy Project Tracker — storage.js
   Local mode: localStorage (default, no setup required).
   Cloud mode: Firestore, active automatically when FIREBASE_ENABLED is true.
   Same interface either way so app.js doesn't need to know which is active.
   ========================================================================== */

var Storage = (function () {
  "use strict";

  var KEY = "idfy_tracker_projects_v1";
  var unsubProjects = null;

  function isCloud() { return window.FIREBASE_ENABLED && Auth.state().isApproved; }

  // ---- local (localStorage) ----
  function localLoad() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) { console.error("Storage.localLoad failed", e); return null; }
  }
  function localSave(projects) {
    try { window.localStorage.setItem(KEY, JSON.stringify(projects)); return true; }
    catch (e) { console.error("Storage.localSave failed", e); return false; }
  }

  // ---- cloud (Firestore) ----
  // Each project is one document in the "projects" collection, doc id = project.id
  function cloudLoadOnce(callback) {
    Auth.getDb().collection("projects").get().then(function (snap) {
      var rows = [];
      snap.forEach(function (doc) { rows.push(doc.data()); });
      callback(rows);
    }).catch(function (e) { console.error("cloudLoadOnce failed", e); callback([]); });
  }

  // Live subscription — every approved user sees changes from every other
  // approved user immediately, no refresh needed.
  function subscribe(onChange) {
    if (isCloud()) {
      if (unsubProjects) unsubProjects();
      unsubProjects = Auth.getDb().collection("projects").onSnapshot(function (snap) {
        var rows = [];
        snap.forEach(function (doc) { rows.push(doc.data()); });
        onChange(rows);
      }, function (err) { console.error("Firestore subscribe error", err); });
    } else {
      onChange(localLoad() || []);
    }
  }

  function unsubscribe() {
    if (unsubProjects) { unsubProjects(); unsubProjects = null; }
  }

  // Save the full project list. In cloud mode this diffs against what's
  // already there so we don't blow away docs unrelated to this write.
  function save(projects, previousIds) {
    if (isCloud()) {
      var db = Auth.getDb();
      var batch = db.batch();
      var seenIds = {};
      projects.forEach(function (p) {
        seenIds[p.id] = true;
        batch.set(db.collection("projects").doc(p.id), p);
      });
      (previousIds || []).forEach(function (id) {
        if (!seenIds[id]) batch.delete(db.collection("projects").doc(id));
      });
      return batch.commit().catch(function (e) { console.error("Firestore save failed", e); alert("Could not save to the cloud — check your connection and try again."); });
    }
    return Promise.resolve(localSave(projects));
  }

  // Single-project convenience writes (avoid re-sending the whole portfolio
  // on every keystroke-driven save when in cloud mode)
  function saveProject(project) {
    if (isCloud()) {
      return Auth.getDb().collection("projects").doc(project.id).set(project)
        .catch(function (e) { console.error("Firestore saveProject failed", e); alert("Could not save to the cloud — check your connection and try again."); });
    }
    return Promise.resolve();
  }
  function deleteProject(id) {
    if (isCloud()) {
      return Auth.getDb().collection("projects").doc(id).delete()
        .catch(function (e) { console.error("Firestore deleteProject failed", e); });
    }
    return Promise.resolve();
  }

  function clear() {
    try { window.localStorage.removeItem(KEY); return true; }
    catch (e) { return false; }
  }

  // ---- export / import ----
  function exportJSON(projects) {
    var blob = new Blob([JSON.stringify(projects, null, 2)], { type: "application/json" });
    downloadBlob(blob, "idfy-project-tracker-export.json");
  }

  function downloadTemplate() {
    var template = [
      {
        id: "proj_example_001",
        client: "Example Client Ltd",
        projectName: "Example Privy Rollout",
        projectType: "POC",
        environment: "Cloud",
        cloudProvider: "GCP",
        infrastructureOwnership: "Client",
        owner: "Your Name",
        startDate: "2026-08-01",
        targetDate: "2026-10-01",
        status: "planned",
        health: "ON TRACK",
        modules: ["CGP", "DPRM"],
        description: "One-line description of the engagement.",
        activities: [
          {
            id: "act_example_001",
            date: "2026-08-01",
            activityType: "MEETING",
            description: "Kickoff call",
            ownerType: "PROJECT / PM",
            owner: "Your Name",
            dependencySide: "Internal",
            requestedBy: "",
            requestedDate: "",
            expectedDate: "",
            receivedDate: "",
            status: "COMPLETED",
            impact: "",
            relatedPhase: "",
            notes: ""
          }
        ],
        auditLog: [
          { date: "2026-08-01", text: "Project created" }
        ]
      }
    ];
    var blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    downloadBlob(blob, "idfy-tracker-import-template.json");
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var REQUIRED_PROJECT_FIELDS = ["client", "projectName", "projectType", "status", "health"];
  var VALID_STATUS_KEYS = ["backlog", "planned", "in-progress", "blocked", "uat", "completed"];

  // Validates shape and returns { valid, errors[] }
  function validateImport(data) {
    var errors = [];
    if (!Array.isArray(data)) {
      return { valid: false, errors: ["Top level must be a JSON array of project objects — see Settings \u2192 Download import template."] };
    }
    data.forEach(function (p, i) {
      REQUIRED_PROJECT_FIELDS.forEach(function (f) {
        if (p[f] == null || p[f] === "") errors.push("Project #" + (i + 1) + " is missing required field \"" + f + "\".");
      });
      if (p.status && VALID_STATUS_KEYS.indexOf(p.status) === -1) {
        errors.push("Project #" + (i + 1) + " (" + (p.projectName || "unnamed") + ") has invalid status \"" + p.status + "\". Must be one of: " + VALID_STATUS_KEYS.join(", ") + ".");
      }
      if (p.modules && !Array.isArray(p.modules)) errors.push("Project #" + (i + 1) + " \"modules\" must be an array.");
      if (p.activities && !Array.isArray(p.activities)) errors.push("Project #" + (i + 1) + " \"activities\" must be an array.");
      if (!p.id) p.id = Data.generateId("proj");
      if (!p.activities) p.activities = [];
      if (!p.auditLog) p.auditLog = [{ date: Data.todayStr(), text: "Imported" }];
      (p.activities || []).forEach(function (a) { if (!a.id) a.id = Data.generateId("act"); });
    });
    return { valid: errors.length === 0, errors: errors, data: data };
  }

  function importJSON(file, callback) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var parsed = JSON.parse(e.target.result);
        var result = validateImport(parsed);
        if (!result.valid) { callback(new Error(result.errors.join("\n")), null); return; }
        callback(null, result.data);
      } catch (err) {
        callback(new Error("That file isn't valid JSON: " + err.message), null);
      }
    };
    reader.onerror = function () { callback(new Error("Could not read file"), null); };
    reader.readAsText(file);
  }

  return {
    isCloud: isCloud,
    localLoad: localLoad,
    localSave: localSave,
    cloudLoadOnce: cloudLoadOnce,
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    save: save,
    saveProject: saveProject,
    deleteProject: deleteProject,
    clear: clear,
    exportJSON: exportJSON,
    downloadTemplate: downloadTemplate,
    validateImport: validateImport,
    importJSON: importJSON
  };
})();
