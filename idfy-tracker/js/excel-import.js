/* ==========================================================================
   IDfy Project Tracker — excel-import.js
   Excel (.xlsx) is the primary data entry format: one workbook, two sheets
   (Projects, Activities), linked by Client + Project Name. Google Sheets
   round-trips fine — edit there, then File > Download > Microsoft Excel.
   Requires the SheetJS library (loaded in index.html) at window.XLSX.
   ========================================================================== */

var ExcelIO = (function () {
  "use strict";

  var PROJECT_HEADERS = [
    "Client", "Project Name", "Project Type", "Environment", "Cloud Provider",
    "Infrastructure Ownership", "Owner", "Start Date", "Target Date",
    "Status", "Health", "Modules", "Description"
  ];

  var ACTIVITY_HEADERS = [
    "Client", "Project Name", "Date", "Activity Type", "Description",
    "Owner Type", "Owner", "Dependency Side", "Requested By",
    "Requested Date", "Expected Date", "Received Date", "Status",
    "Impact", "Related Phase", "Notes"
  ];

  function isReady() { return typeof window.XLSX !== "undefined"; }

  // ---------------------------------------------------------------- template
  function downloadTemplate() {
    if (!isReady()) { alert("Excel library didn't load — check your internet connection and try again."); return; }

    var projectExample = [
      "Example Client Ltd", "Example Privy Rollout", "POC", "Cloud", "GCP",
      "Client", "Your Name", "2026-08-01", "2026-10-01",
      "Planned", "ON TRACK", "CGP, DPRM", "One-line description of the engagement."
    ];
    var activityExample = [
      "Example Client Ltd", "Example Privy Rollout", "2026-08-01", "MEETING", "Kickoff call",
      "PROJECT / PM", "Your Name", "Internal", "",
      "", "", "", "COMPLETED",
      "", "", ""
    ];
    var activityExample2 = [
      "Example Client Ltd", "Example Privy Rollout", "2026-08-05", "REQUEST", "Sandbox access requested",
      "CLIENT", "Client IT Team", "Client", "Your Name",
      "2026-08-05", "2026-08-12", "", "WAITING",
      "Blocks environment setup", "", "Leave Received Date blank until it actually arrives"
    ];

    var wb = window.XLSX.utils.book_new();

    var wsProjects = window.XLSX.utils.aoa_to_sheet([PROJECT_HEADERS, projectExample]);
    wsProjects["!cols"] = PROJECT_HEADERS.map(function () { return { wch: 20 }; });
    window.XLSX.utils.book_append_sheet(wb, wsProjects, "Projects");

    var wsActivities = window.XLSX.utils.aoa_to_sheet([ACTIVITY_HEADERS, activityExample, activityExample2]);
    wsActivities["!cols"] = ACTIVITY_HEADERS.map(function () { return { wch: 18 }; });
    window.XLSX.utils.book_append_sheet(wb, wsActivities, "Activities");

    var notes = [
      ["How to use this template"],
      [""],
      ["1. One row per project on the \"Projects\" sheet."],
      ["2. One row per activity/timeline entry on the \"Activities\" sheet."],
      ["3. Activities are linked to a project by matching Client + Project Name exactly — spelling must match between the two sheets."],
      ["4. Dates must be in YYYY-MM-DD format (e.g. 2026-08-25). Leave a date blank if it hasn't happened yet."],
      ["5. Modules column: comma-separated, e.g. \"CGP, DPRM, Cookie Manager\"."],
      [""],
      ["Allowed values — Project Type:"], ["POC, LIVE"],
      ["Allowed values — Environment:"], ["SaaS, Cloud, On-Prem"],
      ["Allowed values — Cloud Provider (only if Environment = Cloud):"], ["AWS, Azure, GCP, Other"],
      ["Allowed values — Infrastructure Ownership:"], ["IDfy, Client, Shared"],
      ["Allowed values — Status:"], ["Backlog, Planned, In Progress, Blocked, UAT, Completed"],
      ["Allowed values — Health:"], ["ON TRACK, AT RISK, DELAYED, BLOCKED"],
      ["Allowed values — Modules:"], [Data.MODULES.join(", ")],
      [""],
      ["Allowed values — Activity Type:"], [Data.ACTIVITY_TYPES.join(", ")],
      ["Allowed values — Owner Type:"], [Data.OWNER_TYPES.join(", ")],
      ["Allowed values — Dependency Side:"], ["Client, Internal, Other"],
      ["Allowed values — Activity Status:"], [Data.ACTIVITY_STATUSES.join(", ")],
      [""],
      ["You can edit this file in Google Sheets: upload it to Google Drive,"],
      ["open with Google Sheets, edit, then File > Download > Microsoft Excel"],
      ["(.xlsx), and upload that file back into the tracker via Settings > Import."]
    ];
    var wsNotes = window.XLSX.utils.aoa_to_sheet(notes);
    wsNotes["!cols"] = [{ wch: 90 }];
    window.XLSX.utils.book_append_sheet(wb, wsNotes, "Instructions");

    window.XLSX.writeFile(wb, "idfy-tracker-import-template.xlsx");
  }

  // ---------------------------------------------------------------- import
  function key(client, projectName) {
    return (String(client || "").trim() + "␟" + String(projectName || "").trim()).toLowerCase();
  }

  function sheetRows(wb, name) {
    var sheetName = wb.SheetNames.filter(function (n) { return n.toLowerCase() === name.toLowerCase(); })[0];
    if (!sheetName) return null;
    return window.XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: false });
  }

  function excelDateToStr(val) {
    if (val == null || val === "") return "";
    if (typeof val === "string") {
      var s = val.trim();
      // Already ISO-ish? keep as-is (validated later).
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      // Try to parse common spreadsheet date strings (e.g. "8/25/2026").
      var d = new Date(s);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      return s;
    }
    if (typeof val === "number") {
      // Excel serial date number (days since 1899-12-30)
      var parsed = window.XLSX.SSF ? window.XLSX.SSF.parse_date_code(val) : null;
      if (parsed) {
        var mm = String(parsed.m).padStart(2, "0");
        var dd = String(parsed.d).padStart(2, "0");
        return parsed.y + "-" + mm + "-" + dd;
      }
    }
    return String(val);
  }

  function parseWorkbook(wb) {
    var errors = [];
    var projectRows = sheetRows(wb, "Projects");
    var activityRows = sheetRows(wb, "Activities") || [];

    if (!projectRows) {
      return { valid: false, errors: ["Couldn't find a \"Projects\" sheet in this file. Use Settings \u2192 Download Excel template to get the exact expected sheet names and columns."] };
    }
    if (!projectRows.length) {
      return { valid: false, errors: ["The \"Projects\" sheet has no data rows."] };
    }

    var byKey = {};
    var projects = [];

    projectRows.forEach(function (row, i) {
      var rowNum = i + 2; // +1 for 0-index, +1 for header row
      var client = String(row["Client"] || "").trim();
      var projectName = String(row["Project Name"] || "").trim();
      if (!client) errors.push("Projects row " + rowNum + ": missing Client.");
      if (!projectName) errors.push("Projects row " + rowNum + ": missing Project Name.");

      var projectType = Data.fuzzyMatch(row["Project Type"], Data.PROJECT_TYPES);
      if (!projectType) errors.push("Projects row " + rowNum + " (" + (projectName || "unnamed") + "): Project Type must be one of " + Data.PROJECT_TYPES.join("/") + ", got \"" + row["Project Type"] + "\".");

      var environment = Data.fuzzyMatch(row["Environment"], Data.ENV_TYPES);
      if (!environment) errors.push("Projects row " + rowNum + " (" + (projectName || "unnamed") + "): Environment must be one of " + Data.ENV_TYPES.join("/") + ", got \"" + row["Environment"] + "\".");

      var cloudProvider = "";
      if (environment === "Cloud") {
        cloudProvider = Data.fuzzyMatch(row["Cloud Provider"], Data.CLOUD_PROVIDERS) || "";
        if (!cloudProvider) errors.push("Projects row " + rowNum + " (" + (projectName || "unnamed") + "): Environment is Cloud but Cloud Provider is missing/invalid (must be " + Data.CLOUD_PROVIDERS.join("/") + ").");
      }

      var infra = Data.fuzzyMatch(row["Infrastructure Ownership"], Data.INFRA_OWNERSHIP);
      if (!infra) errors.push("Projects row " + rowNum + " (" + (projectName || "unnamed") + "): Infrastructure Ownership must be one of " + Data.INFRA_OWNERSHIP.join("/") + ", got \"" + row["Infrastructure Ownership"] + "\".");

      var statusLabel = String(row["Status"] || "").trim();
      var statusKey = Data.statusKeyFromLabel(statusLabel);
      if (!statusKey) errors.push("Projects row " + rowNum + " (" + (projectName || "unnamed") + "): Status must be one of Backlog/Planned/In Progress/Blocked/UAT/Completed, got \"" + statusLabel + "\".");

      var health = Data.fuzzyMatch(row["Health"], Data.HEALTHS);
      if (!health) errors.push("Projects row " + rowNum + " (" + (projectName || "unnamed") + "): Health must be one of " + Data.HEALTHS.join("/") + ", got \"" + row["Health"] + "\".");

      var startDate = excelDateToStr(row["Start Date"]);
      if (!startDate) errors.push("Projects row " + rowNum + " (" + (projectName || "unnamed") + "): missing Start Date.");

      var project = {
        id: Data.generateId("proj"),
        client: client,
        projectName: projectName,
        projectType: projectType || "POC",
        environment: environment || "SaaS",
        cloudProvider: cloudProvider,
        infrastructureOwnership: infra || "IDfy",
        owner: String(row["Owner"] || "").trim(),
        ownerEmail: "",
        startDate: startDate,
        targetDate: excelDateToStr(row["Target Date"]),
        status: statusKey || "backlog",
        health: health || "ON TRACK",
        modules: Data.parseModuleList(row["Modules"]),
        description: String(row["Description"] || "").trim(),
        activities: [],
        auditLog: [{ date: Data.todayStr(), text: "Imported from Excel" }]
      };

      var k = key(client, projectName);
      if (byKey[k]) {
        errors.push("Projects row " + rowNum + ": duplicate Client + Project Name (\"" + client + " / " + projectName + "\") already appears in an earlier row.");
      } else {
        byKey[k] = project;
        projects.push(project);
      }
    });

    activityRows.forEach(function (row, i) {
      var rowNum = i + 2;
      var client = String(row["Client"] || "").trim();
      var projectName = String(row["Project Name"] || "").trim();
      var k = key(client, projectName);
      var project = byKey[k];

      if (!client && !projectName && !row["Description"]) return; // skip fully blank row

      if (!project) {
        errors.push("Activities row " + rowNum + ": no project found matching Client \"" + client + "\" + Project Name \"" + projectName + "\" — check spelling matches the Projects sheet exactly.");
        return;
      }

      var activityType = Data.fuzzyMatch(row["Activity Type"], Data.ACTIVITY_TYPES);
      if (!activityType) errors.push("Activities row " + rowNum + ": Activity Type \"" + row["Activity Type"] + "\" isn't recognized. See the Instructions sheet for the allowed list.");

      var ownerType = Data.fuzzyMatch(row["Owner Type"], Data.OWNER_TYPES);
      if (!ownerType) errors.push("Activities row " + rowNum + ": Owner Type \"" + row["Owner Type"] + "\" isn't recognized. See the Instructions sheet for the allowed list.");

      var depSide = Data.fuzzyMatch(row["Dependency Side"], Data.DEPENDENCY_SIDES) || "Internal";

      var status = Data.fuzzyMatch(row["Status"], Data.ACTIVITY_STATUSES);
      if (!status) errors.push("Activities row " + rowNum + ": Status \"" + row["Status"] + "\" isn't recognized. See the Instructions sheet for the allowed list.");

      var date = excelDateToStr(row["Date"]);
      if (!date) errors.push("Activities row " + rowNum + ": missing Date.");
      if (!String(row["Description"] || "").trim()) errors.push("Activities row " + rowNum + ": missing Description.");

      project.activities.push({
        id: Data.generateId("act"),
        date: date,
        activityType: activityType || "STATUS UPDATE",
        description: String(row["Description"] || "").trim(),
        ownerType: ownerType || "OTHER",
        owner: String(row["Owner"] || "").trim(),
        dependencySide: depSide,
        requestedBy: String(row["Requested By"] || "").trim(),
        requestedDate: excelDateToStr(row["Requested Date"]),
        expectedDate: excelDateToStr(row["Expected Date"]),
        receivedDate: excelDateToStr(row["Received Date"]),
        status: status || "OPEN",
        impact: String(row["Impact"] || "").trim(),
        relatedPhase: String(row["Related Phase"] || "").trim(),
        notes: String(row["Notes"] || "").trim()
      });
    });

    return { valid: errors.length === 0, errors: errors, data: projects };
  }

  function importFile(file, callback) {
    if (!isReady()) { callback(new Error("Excel library didn't load — check your internet connection and try again."), null); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var wb = window.XLSX.read(data, { type: "array", cellDates: false });
        var result = parseWorkbook(wb);
        if (!result.valid) { callback(new Error(result.errors.join("\n")), null); return; }
        callback(null, result.data);
      } catch (err) {
        callback(new Error("Couldn't read that file as Excel: " + err.message), null);
      }
    };
    reader.onerror = function () { callback(new Error("Could not read file"), null); };
    reader.readAsArrayBuffer(file);
  }

  return { isReady: isReady, downloadTemplate: downloadTemplate, importFile: importFile };
})();
