/* ==========================================================================
   IDfy Project Tracker — analytics.js
   Analytics page: distribution bars, waiting-time analysis, top offenders.
   ========================================================================== */

var Analytics = (function () {
  "use strict";

  var PALETTE = ["#11276D", "#5B4FCF", "#1F8A4C", "#B8860B", "#CE1010", "#6D6E71", "#2C7BC9", "#8A6D3B"];

  function countBy(items, fn) {
    var map = {};
    items.forEach(function (item) {
      var keys = fn(item);
      if (!Array.isArray(keys)) keys = [keys];
      keys.forEach(function (k) {
        if (k == null || k === "") k = "—";
        map[k] = (map[k] || 0) + 1;
      });
    });
    return map;
  }

  function renderBarList(title, counts, total) {
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var html = '<div class="analytics-card">';
    html += '<div class="analytics-card-title">' + title + "</div>";
    if (!keys.length) {
      html += '<div class="empty-state">No data</div>';
    } else {
      keys.forEach(function (k, i) {
        var pct = total ? Math.round((counts[k] / total) * 100) : 0;
        var color = PALETTE[i % PALETTE.length];
        html += '<div class="bar-row">';
        html += '<div class="bar-label"><span>' + App.esc(k) + '</span><span class="bar-value">' + counts[k] + "</span></div>";
        html += '<div class="bar-track"><div class="bar-fill" style="width:' + pct + "%;background:" + color + ';"></div></div>';
        html += "</div>";
      });
    }
    html += "</div>";
    return html;
  }

  function render(container, projects) {
    var total = projects.length;

    var byStatus = countBy(projects, function (p) {
      var s = Data.STATUSES.find(function (x) { return x.key === p.status; });
      return s ? s.label : p.status;
    });
    var byType = countBy(projects, function (p) { return p.projectType; });
    var byEnv = countBy(projects, function (p) { return Kanban.envLabel(p); });
    var byModule = countBy(projects, function (p) { return p.modules; });
    var byHealth = countBy(projects, function (p) { return p.health; });

    var waitingTotals = { Client: 0, Internal: 0, Other: 0 };
    var waitingByProject = [];
    var blockedProjects = [];

    projects.forEach(function (p) {
      var a = Data.calcProjectAnalytics(p);
      waitingTotals.Client += a.clientWaiting;
      waitingTotals.Internal += a.internalWaiting;
      waitingTotals.Other += a.otherWaiting;
      waitingByProject.push({ project: p, waiting: a.totalWaiting, breakdown: a });
      if (p.health === "BLOCKED" || p.status === "blocked") blockedProjects.push(p);
    });

    waitingByProject.sort(function (x, y) { return y.waiting - x.waiting; });
    var topWaiting = waitingByProject.filter(function (x) { return x.waiting > 0; }).slice(0, 5);

    var html = '<div class="analytics-grid">';
    html += renderBarList("Projects by Status", byStatus, total);
    html += renderBarList("Projects by Type", byType, total);
    html += renderBarList("Projects by Environment", byEnv, total);
    html += renderBarList("Projects by Privy Module", byModule, total);
    html += renderBarList("Projects by Health", byHealth, total);

    var waitingTotal = waitingTotals.Client + waitingTotals.Internal + waitingTotals.Other;
    html += '<div class="analytics-card">';
    html += '<div class="analytics-card-title">Waiting-Time Analysis (days)</div>';
    ["Client", "Internal", "Other"].forEach(function (k, i) {
      var pct = waitingTotal ? Math.round((waitingTotals[k] / waitingTotal) * 100) : 0;
      html += '<div class="bar-row">';
      html += '<div class="bar-label"><span>' + k + " Waiting</span><span class=\"bar-value\">" + waitingTotals[k] + " d</span></div>";
      html += '<div class="bar-track"><div class="bar-fill" style="width:' + pct + "%;background:" + PALETTE[i] + ';"></div></div>';
      html += "</div>";
    });
    html += "</div>";

    html += '<div class="analytics-card analytics-card-wide">';
    html += '<div class="analytics-card-title">Top Projects by Waiting Time</div>';
    if (!topWaiting.length) {
      html += '<div class="empty-state">No outstanding waiting time recorded.</div>';
    } else {
      html += '<ol class="top-waiting-list">';
      topWaiting.forEach(function (item) {
        html += "<li>" +
          '<a href="#" class="row-link" data-open-project="' + item.project.id + '">' +
          App.esc(item.project.client) + " — " + App.esc(item.project.projectName) +
          "</a>" +
          '<span class="waiting-badge waiting-hot">' + item.waiting + " d</span>" +
          "</li>";
      });
      html += "</ol>";
    }
    html += "</div>";

    html += '<div class="analytics-card analytics-card-wide">';
    html += '<div class="analytics-card-title">Currently Blocked Projects</div>';
    if (!blockedProjects.length) {
      html += '<div class="empty-state">No projects are currently blocked.</div>';
    } else {
      html += '<ul class="blocked-list">';
      blockedProjects.forEach(function (p) {
        var dep = Data.currentDependency(p);
        html += "<li>" +
          '<a href="#" class="row-link" data-open-project="' + p.id + '">' + App.esc(p.client) + " — " + App.esc(p.projectName) + "</a>" +
          (dep ? '<span class="blocked-reason">' + App.esc(dep.description) + "</span>" : "") +
          "</li>";
      });
      html += "</ul>";
    }
    html += "</div>";

    html += "</div>";
    container.innerHTML = html;

    container.querySelectorAll("[data-open-project]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        App.openProjectDrawer(el.getAttribute("data-open-project"));
      });
    });
  }

  return { render: render };
})();
