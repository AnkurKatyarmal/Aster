/* ==========================================================================
   IDfy Project Tracker — storage.js
   localStorage persistence layer.
   ========================================================================== */

var Storage = (function () {
  "use strict";

  var KEY = "idfy_tracker_projects_v1";

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed;
    } catch (e) {
      console.error("Storage.load failed", e);
      return null;
    }
  }

  function save(projects) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(projects));
      return true;
    } catch (e) {
      console.error("Storage.save failed", e);
      return false;
    }
  }

  function clear() {
    try {
      window.localStorage.removeItem(KEY);
      return true;
    } catch (e) {
      console.error("Storage.clear failed", e);
      return false;
    }
  }

  function exportJSON(projects) {
    var blob = new Blob([JSON.stringify(projects, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "idfy-project-tracker-export.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importJSON(file, callback) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed)) throw new Error("Invalid format — expected an array of projects");
        callback(null, parsed);
      } catch (err) {
        callback(err, null);
      }
    };
    reader.onerror = function () { callback(new Error("Could not read file"), null); };
    reader.readAsText(file);
  }

  return {
    load: load,
    save: save,
    clear: clear,
    exportJSON: exportJSON,
    importJSON: importJSON
  };
})();
