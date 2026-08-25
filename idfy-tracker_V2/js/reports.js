/* ==========================================================================
   IDfy Project Tracker — reports.js
   Builds print-ready HTML documents (project report / weekly status report)
   and opens them in a new window so the user can "Save as PDF" via the
   browser's native print dialog — no external PDF library required.
   ========================================================================== */

var Reports = (function () {
  "use strict";

  var BRAND = {
    navy: "#11276D",
    red: "#CE1010",
    grey: "#6D6E71",
    navyTint: "#EEF1F8"
  };

  function shellOpen(title) {
    var reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      alert("Your browser blocked the report window. Please allow pop-ups for this site and try again.");
      return null;
    }
    reportWindow.document.write(
      "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>" + title + "</title>" +
      "<style>" + reportCss() + "</style></head><body><div class='report-toolbar no-print'>" +
      "<button onclick='window.print()'>Print / Save as PDF</button>" +
      "<button onclick='window.close()'>Close</button>" +
      "</div><div id='reportRoot'></div></body></html>"
    );
    reportWindow.document.close();
    return reportWindow;
  }

  function reportCss() {
    return [
      "*{box-sizing:border-box;}",
      "body{font-family:Inter,-apple-system,'Segoe UI',sans-serif;color:#1A1D29;margin:0;padding:0;background:#fff;}",
      ".report-toolbar{position:sticky;top:0;background:#fff;padding:12px 24px;border-bottom:1px solid #E3E6EE;display:flex;gap:10px;justify-content:flex-end;z-index:10;}",
      ".report-toolbar button{font-family:inherit;font-size:13px;font-weight:600;padding:8px 16px;border-radius:6px;border:1px solid " + BRAND.navy + ";background:" + BRAND.navy + ";color:#fff;cursor:pointer;}",
      ".report-toolbar button:last-child{background:#fff;color:" + BRAND.navy + ";}",
      "#reportRoot{max-width:860px;margin:0 auto;padding:36px 40px 60px;}",
      ".rp-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid " + BRAND.navy + ";padding-bottom:14px;margin-bottom:24px;}",
      ".rp-brand{font-size:13px;font-weight:700;color:" + BRAND.navy + ";text-transform:uppercase;letter-spacing:0.5px;}",
      ".rp-brand-sub{font-size:11px;color:" + BRAND.grey + ";margin-top:2px;}",
      ".rp-title{font-size:22px;font-weight:700;color:" + BRAND.navy + ";margin:0;}",
      ".rp-meta{font-size:11.5px;color:" + BRAND.grey + ";text-align:right;}",
      ".rp-section{margin-bottom:26px;}",
      ".rp-section-title{font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:" + BRAND.navy + ";border-bottom:1px solid #E3E6EE;padding-bottom:6px;margin-bottom:12px;}",
      ".rp-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:12.5px;}",
      ".rp-grid div span{display:block;}",
      ".rp-label{color:" + BRAND.grey + ";font-size:10px;text-transform:uppercase;letter-spacing:0.3px;}",
      ".rp-value{font-weight:600;}",
      "table.rp-table{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:10px;}",
      "table.rp-table th{text-align:left;background:" + BRAND.navyTint + ";color:" + BRAND.navy + ";padding:7px 9px;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #E3E6EE;}",
      "table.rp-table td{padding:7px 9px;border-bottom:1px solid #EEE;vertical-align:top;}",
      ".rp-badge{display:inline-block;font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:10px;text-transform:uppercase;}",
      ".rp-badge-live{background:#E6F4EB;color:#1F8A4C;}",
      ".rp-badge-poc{background:#EEEDFB;color:#5B4FCF;}",
      ".rp-stat-row{display:flex;gap:14px;margin-bottom:16px;flex-wrap:wrap;}",
      ".rp-stat{border:1px solid #E3E6EE;border-radius:6px;padding:10px 16px;text-align:center;min-width:110px;}",
      ".rp-stat-value{font-size:20px;font-weight:700;color:" + BRAND.navy + ";}",
      ".rp-stat-label{font-size:10px;color:" + BRAND.grey + ";text-transform:uppercase;margin-top:2px;}",
      ".rp-timeline-item{border-left:3px solid " + BRAND.navy + ";padding:4px 0 4px 12px;margin-bottom:8px;font-size:11.5px;}",
      ".rp-timeline-item.client{border-left-color:" + BRAND.red + ";}",
      ".rp-timeline-date{font-weight:700;color:" + BRAND.navy + ";margin-right:8px;}",
      ".rp-empty{color:" + BRAND.grey + ";font-size:12px;font-style:italic;}",
      "@media print{.no-print{display:none !important;} body{padding:0;} #reportRoot{padding:0 6mm;max-width:none;} @page{margin:14mm;}}"
    ].join("\n");
  }

  function esc(s) { return App.esc(s); }

  // -------------------------------------------------- single project report
  function projectReport(project) {
    var win = shellOpen("Report — " + project.client);
    if (!win) return;
    var a = Data.calcProjectAnalytics(project);
    var dep = Data.currentDependency(project);
    var statusLabel = (Data.STATUSES.filter(function (s) { return s.key === project.status; })[0] || {}).label || project.status;

    var html = "";
    html += "<div class='rp-header'>" +
      "<div><div class='rp-brand'>IDfy — by IDfy</div><div class='rp-brand-sub'>Privy Project Delivery Report</div>" +
      "<h1 class='rp-title'>" + esc(project.client) + " — " + esc(project.projectName) + "</h1></div>" +
      "<div class='rp-meta'>Generated " + Data.formatDate(Data.todayStr()) + "<br>Owner: " + esc(project.owner) + "</div>" +
      "</div>";

    html += "<div class='rp-stat-row'>";
    html += statBlock("Total Elapsed", a.totalElapsed + "d");
    html += statBlock("Active Work", a.activeWork + "d");
    html += statBlock("Client Waiting", a.clientWaiting + "d");
    html += statBlock("Internal Waiting", a.internalWaiting + "d");
    html += "</div>";

    html += "<div class='rp-section'><div class='rp-section-title'>Project Information</div><div class='rp-grid'>";
    html += gridItem("Project Type", "<span class='rp-badge " + (project.projectType === "LIVE" ? "rp-badge-live" : "rp-badge-poc") + "'>" + project.projectType + "</span>");
    html += gridItem("Status", statusLabel);
    html += gridItem("Health", project.health);
    html += gridItem("Environment", Kanban.envLabel(project));
    html += gridItem("Infrastructure Ownership", project.infrastructureOwnership);
    html += gridItem("Start Date", Data.formatDate(project.startDate));
    html += gridItem("Target Date", Data.formatDate(project.targetDate));
    html += gridItem("Modules", (project.modules || []).join(", ") || "—");
    html += "</div>";
    if (project.description) html += "<p style='font-size:12px;color:#555;margin-top:10px;'>" + esc(project.description) + "</p>";
    html += "</div>";

    html += "<div class='rp-section'><div class='rp-section-title'>Current Dependency</div>";
    if (dep) {
      var w = Data.calcWaiting(dep);
      html += "<div class='rp-grid'>";
      html += gridItem("Dependency", dep.description);
      html += gridItem("Owner", dep.owner + " (" + dep.dependencySide + ")");
      html += gridItem("Requested", Data.formatDate(dep.requestedDate));
      html += gridItem("Received", dep.receivedDate ? Data.formatDate(dep.receivedDate) : "Not yet received");
      html += gridItem("Waiting", w.days + " day(s)");
      if (dep.impact) html += gridItem("Impact", dep.impact);
      html += "</div>";
    } else {
      html += "<div class='rp-empty'>No outstanding dependency.</div>";
    }
    html += "</div>";

    html += "<div class='rp-section'><div class='rp-section-title'>Activity Timeline</div>";
    var activities = (project.activities || []).slice().sort(function (x, y) { return (x.date || "").localeCompare(y.date || ""); });
    if (!activities.length) {
      html += "<div class='rp-empty'>No activities logged.</div>";
    } else {
      activities.forEach(function (act) {
        var sideClass = act.dependencySide === "Client" ? "client" : "";
        html += "<div class='rp-timeline-item " + sideClass + "'>" +
          "<span class='rp-timeline-date'>" + Data.formatDate(act.date) + "</span>" +
          esc(act.ownerType) + " · " + esc(act.owner || "—") + " — " + esc(act.description) +
          (act.status ? " <em>(" + esc(act.status) + ")</em>" : "") +
          "</div>";
      });
    }
    html += "</div>";

    win.document.getElementById("reportRoot").innerHTML = html;
    setTimeout(function () { try { win.focus(); } catch (e) {} }, 300);
  }

  function statBlock(label, value) {
    return "<div class='rp-stat'><div class='rp-stat-value'>" + value + "</div><div class='rp-stat-label'>" + label + "</div></div>";
  }
  function gridItem(label, value) {
    return "<div><span class='rp-label'>" + label + "</span><span class='rp-value'>" + (typeof value === "string" && value.indexOf("<") === 0 ? value : esc(value)) + "</span></div>";
  }

  // -------------------------------------------------- weekly status report
  function weeklyReport(projects, fromDate, toDate) {
    var win = shellOpen("Weekly Status Update");
    if (!win) return;

    var rows = [];
    projects.forEach(function (p) {
      (p.activities || []).forEach(function (a) {
        if ((a.date || "") >= fromDate && (a.date || "") <= toDate) {
          rows.push({ project: p, activity: a });
        }
      });
    });
    rows.sort(function (x, y) { return (x.activity.date || "").localeCompare(y.activity.date || ""); });

    var total = projects.length;
    var live = projects.filter(function (p) { return p.projectType === "LIVE"; }).length;
    var blocked = projects.filter(function (p) { return p.status === "blocked"; }).length;
    var atRisk = projects.filter(function (p) { return p.health === "AT RISK" || p.health === "DELAYED"; }).length;

    var html = "";
    html += "<div class='rp-header'>" +
      "<div><div class='rp-brand'>IDfy — by IDfy</div><div class='rp-brand-sub'>Weekly Delivery Status Update</div>" +
      "<h1 class='rp-title'>Portfolio Status — " + Data.formatDate(fromDate) + " to " + Data.formatDate(toDate) + "</h1></div>" +
      "<div class='rp-meta'>Generated " + Data.formatDate(Data.todayStr()) + "</div>" +
      "</div>";

    html += "<div class='rp-stat-row'>";
    html += statBlock("Total Projects", total);
    html += statBlock("Live", live);
    html += statBlock("At Risk / Delayed", atRisk);
    html += statBlock("Blocked", blocked);
    html += "</div>";

    html += "<div class='rp-section'><div class='rp-section-title'>Project Status Summary</div>";
    html += "<table class='rp-table'><thead><tr><th>Client</th><th>Project</th><th>Type</th><th>Status</th><th>Health</th><th>Waiting</th></tr></thead><tbody>";
    projects.forEach(function (p) {
      var a = Data.calcProjectAnalytics(p);
      var statusLabel = (Data.STATUSES.filter(function (s) { return s.key === p.status; })[0] || {}).label || p.status;
      html += "<tr><td>" + esc(p.client) + "</td><td>" + esc(p.projectName) + "</td>" +
        "<td><span class='rp-badge " + (p.projectType === "LIVE" ? "rp-badge-live" : "rp-badge-poc") + "'>" + p.projectType + "</span></td>" +
        "<td>" + esc(statusLabel) + "</td><td>" + esc(p.health) + "</td>" +
        "<td>" + (a.totalWaiting > 0 ? a.totalWaiting + "d" : "—") + "</td></tr>";
    });
    html += "</tbody></table></div>";

    html += "<div class='rp-section'><div class='rp-section-title'>Activity This Period</div>";
    if (!rows.length) {
      html += "<div class='rp-empty'>No activity logged in this date range.</div>";
    } else {
      html += "<table class='rp-table'><thead><tr><th>Date</th><th>Client</th><th>Project</th><th>Activity</th><th>Owner</th><th>Status</th></tr></thead><tbody>";
      rows.forEach(function (r) {
        html += "<tr><td>" + Data.formatDate(r.activity.date) + "</td><td>" + esc(r.project.client) + "</td>" +
          "<td>" + esc(r.project.projectName) + "</td><td>" + esc(r.activity.description) + "</td>" +
          "<td>" + esc(r.activity.owner || "—") + "</td><td>" + esc(r.activity.status) + "</td></tr>";
      });
      html += "</tbody></table>";
    }
    html += "</div>";

    var blockedList = projects.filter(function (p) { return p.status === "blocked" || p.health === "BLOCKED"; });
    html += "<div class='rp-section'><div class='rp-section-title'>Currently Blocked</div>";
    if (!blockedList.length) {
      html += "<div class='rp-empty'>No projects are currently blocked.</div>";
    } else {
      blockedList.forEach(function (p) {
        var dep = Data.currentDependency(p);
        html += "<div class='rp-timeline-item client'>" + esc(p.client) + " — " + esc(p.projectName) +
          (dep ? ": " + esc(dep.description) : "") + "</div>";
      });
    }
    html += "</div>";

    win.document.getElementById("reportRoot").innerHTML = html;
    setTimeout(function () { try { win.focus(); } catch (e) {} }, 300);
  }

  return { projectReport: projectReport, weeklyReport: weeklyReport };
})();
