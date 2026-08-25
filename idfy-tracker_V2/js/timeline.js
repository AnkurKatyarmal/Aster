/* ==========================================================================
   IDfy Project Tracker — timeline.js
   Project-level timeline (vertical) + global cross-project timeline table.
   ========================================================================== */

var Timeline = (function () {
  "use strict";

  function ownerSideClass(side) {
    if (side === "Client") return "side-client";
    if (side === "Internal") return "side-internal";
    return "side-other";
  }

  function statusPill(status) {
    var cls = "pill-neutral";
    if (status === "COMPLETED" || status === "RECEIVED") cls = "pill-green";
    else if (status === "WAITING" || status === "OPEN" || status === "PARTIALLY RECEIVED") cls = "pill-amber";
    else if (status === "BLOCKED" || status === "CANCELLED") cls = "pill-red";
    return '<span class="pill ' + cls + '">' + App.esc(status) + "</span>";
  }

  // -------- project-level vertical timeline --------
  function renderProjectTimeline(project) {
    var activities = (project.activities || []).slice().sort(function (a, b) {
      return (a.date || "").localeCompare(b.date || "");
    });

    if (!activities.length) {
      return '<div class="empty-state">No activities logged yet. Use "Add Activity" to start building the history.</div>';
    }

    // group by date
    var groups = [];
    var byDate = {};
    activities.forEach(function (a) {
      if (!byDate[a.date]) {
        byDate[a.date] = [];
        groups.push(a.date);
      }
      byDate[a.date].push(a);
    });

    var html = '<div class="vtimeline">';
    groups.forEach(function (date) {
      html += '<div class="vtimeline-group">';
      html += '<div class="vtimeline-date">' + Data.formatDate(date) + "</div>";
      html += '<div class="vtimeline-items">';
      byDate[date].forEach(function (a) {
        var w = Data.calcWaiting(a);
        html += '<div class="vtimeline-item">';
        html += '<span class="vtimeline-dot ' + ownerSideClass(a.dependencySide) + '"></span>';
        html += '<div class="vtimeline-content">';
        html += '<div class="vtimeline-head">';
        html += '<span class="vtimeline-owner">' + App.esc(a.ownerType) + " · " + App.esc(a.owner || "—") + "</span>";
        html += '<span class="vtimeline-type">' + App.esc(a.activityType) + "</span>";
        html += "</div>";
        html += '<div class="vtimeline-desc">' + App.esc(a.description) + "</div>";

        var metaBits = [];
        if (a.requestedDate) metaBits.push('<span class="meta-item">Requested: ' + Data.formatDate(a.requestedDate) + "</span>");
        if (a.expectedDate) metaBits.push('<span class="meta-item">Expected: ' + Data.formatDate(a.expectedDate) + "</span>");
        if (a.receivedDate) metaBits.push('<span class="meta-item">Received: ' + Data.formatDate(a.receivedDate) + "</span>");
        if (w.days > 0) {
          metaBits.push('<span class="meta-item waiting-inline ' + (w.isWaiting ? "waiting-active" : "") + '">⏳ ' + w.days + " day" + (w.days === 1 ? "" : "s") + (w.isWaiting ? " (ongoing)" : "") + "</span>");
        }
        if (a.impact) metaBits.push('<span class="meta-item impact-item">Impact: ' + App.esc(a.impact) + "</span>");
        if (metaBits.length) html += '<div class="vtimeline-meta">' + metaBits.join("") + "</div>";

        html += '<div class="vtimeline-footer">' + statusPill(a.status);
        if (a.relatedPhase) html += '<span class="phase-tag">' + App.esc(a.relatedPhase) + "</span>";
        html += '<span class="vtimeline-actions">' +
          '<button class="link-btn" data-edit-activity="' + a.id + '">Edit</button>' +
          '<button class="link-btn link-danger" data-delete-activity="' + a.id + '">Delete</button>' +
          "</span>";
        html += "</div>";
        if (a.notes) html += '<div class="vtimeline-notes">' + App.esc(a.notes) + "</div>";
        html += "</div></div>";
      });
      html += "</div></div>";
    });
    html += "</div>";
    return html;
  }

  // -------- global timeline page --------
  function flattenActivities(projects) {
    var rows = [];
    projects.forEach(function (p) {
      (p.activities || []).forEach(function (a) {
        rows.push({ project: p, activity: a });
      });
    });
    rows.sort(function (a, b) { return (b.activity.date || "").localeCompare(a.activity.date || ""); });
    return rows;
  }

  function renderGlobalTimeline(container, projects, filters) {
    var rows = flattenActivities(projects);

    if (filters) {
      if (filters.client) rows = rows.filter(function (r) { return r.project.client === filters.client; });
      if (filters.projectId) rows = rows.filter(function (r) { return r.project.id === filters.projectId; });
      if (filters.ownerType) rows = rows.filter(function (r) { return r.activity.ownerType === filters.ownerType; });
      if (filters.activityType) rows = rows.filter(function (r) { return r.activity.activityType === filters.activityType; });
      if (filters.status) rows = rows.filter(function (r) { return r.activity.status === filters.status; });
      if (filters.dateFrom) rows = rows.filter(function (r) { return (r.activity.date || "") >= filters.dateFrom; });
      if (filters.dateTo) rows = rows.filter(function (r) { return (r.activity.date || "") <= filters.dateTo; });
    }

    var html = '<div class="table-wrap"><table class="data-table">';
    html += "<thead><tr>" +
      "<th>Date</th><th>Client</th><th>Project</th><th>Activity</th><th>Owner</th>" +
      "<th>Owner Type</th><th>Status</th><th>Dependency</th><th>Waiting</th>" +
      "</tr></thead><tbody>";

    if (!rows.length) {
      html += '<tr><td colspan="9" class="empty-cell">No activities match the current filters.</td></tr>';
    } else {
      rows.forEach(function (r) {
        var a = r.activity, p = r.project;
        var w = Data.calcWaiting(a);
        html += "<tr>";
        html += "<td>" + Data.formatDate(a.date) + "</td>";
        html += "<td>" + App.esc(p.client) + "</td>";
        html += '<td><a href="#" class="row-link" data-open-project="' + p.id + '">' + App.esc(p.projectName) + "</a></td>";
        html += "<td>" + App.esc(a.description) + "</td>";
        html += "<td>" + App.esc(a.owner || "—") + "</td>";
        html += "<td>" + App.esc(a.ownerType) + "</td>";
        html += "<td>" + statusPill(a.status) + "</td>";
        html += "<td>" + (a.dependencySide ? App.esc(a.dependencySide) : "—") + "</td>";
        html += "<td>" + (w.days > 0 ? (w.isWaiting ? "⏳ " : "") + w.days + "d" : "—") + "</td>";
        html += "</tr>";
      });
    }
    html += "</tbody></table></div>";
    container.innerHTML = html;

    container.querySelectorAll("[data-open-project]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        App.openProjectDrawer(el.getAttribute("data-open-project"));
      });
    });
  }

  return {
    renderProjectTimeline: renderProjectTimeline,
    renderGlobalTimeline: renderGlobalTimeline,
    statusPill: statusPill
  };
})();
