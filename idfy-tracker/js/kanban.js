/* ==========================================================================
   IDfy Project Tracker — kanban.js
   Kanban board rendering + drag & drop.
   ========================================================================== */

var Kanban = (function () {
  "use strict";

  function healthDotClass(health) {
    if (health === "ON TRACK") return "dot-green";
    if (health === "AT RISK") return "dot-amber";
    if (health === "DELAYED") return "dot-red";
    if (health === "BLOCKED") return "dot-red-solid";
    return "dot-grey";
  }

  function typeBadgeClass(type) {
    return type === "LIVE" ? "badge-live" : "badge-poc";
  }

  function envLabel(project) {
    if (project.environment === "Cloud") {
      return "Cloud — " + (project.cloudProvider || "—");
    }
    return project.environment || "—";
  }

  function moduleChips(modules, max) {
    max = max || 3;
    var shown = (modules || []).slice(0, max);
    var extra = (modules || []).length - shown.length;
    var html = shown.map(function (m) {
      return '<span class="chip">' + App.esc(m) + "</span>";
    }).join("");
    if (extra > 0) html += '<span class="chip chip-more">+' + extra + "</span>";
    return html || '<span class="chip chip-empty">—</span>';
  }

  function renderCard(project) {
    var analytics = Data.calcProjectAnalytics(project);
    var dep = Data.currentDependency(project);
    var progress = Data.progressFor(project);
    var lastActivity = (project.activities || []).slice().sort(function (a, b) {
      return (a.date || "").localeCompare(b.date || "");
    }).pop();

    var waitingHtml = "";
    if (dep) {
      var w = Data.calcWaiting(dep);
      waitingHtml =
        '<div class="card-row card-dependency">' +
          '<span class="row-label">Dependency</span>' +
          '<span class="row-value">' + App.esc(dep.owner || "—") + "</span>" +
        "</div>" +
        '<div class="card-row">' +
          '<span class="row-label">Waiting</span>' +
          '<span class="waiting-badge ' + (w.days >= 5 ? "waiting-hot" : "") + '">⏳ ' + w.days + " d</span>" +
        "</div>";
    }

    return (
      '<div class="kanban-card" draggable="true" data-id="' + project.id + '">' +
        '<div class="card-top">' +
          '<div class="card-client">' + App.esc(project.client) + "</div>" +
          '<span class="health-dot ' + healthDotClass(project.health) + '" title="Health: ' + App.esc(project.health) + '"></span>' +
        "</div>" +
        '<div class="card-project">' + App.esc(project.projectName) + "</div>" +
        '<div class="card-badges">' +
          '<span class="badge ' + typeBadgeClass(project.projectType) + '">' + project.projectType + "</span>" +
          '<span class="env-pill">' + App.esc(envLabel(project)) + "</span>" +
        "</div>" +
        '<div class="card-modules">' + moduleChips(project.modules) + "</div>" +
        waitingHtml +
        '<div class="card-row">' +
          '<span class="row-label">Last activity</span>' +
          '<span class="row-value">' + (lastActivity ? Data.formatDate(lastActivity.date) : "—") + "</span>" +
        "</div>" +
        '<div class="progress-track"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
      "</div>"
    );
  }

  function render(container, projects) {
    var byStatus = {};
    Data.STATUSES.forEach(function (s) { byStatus[s.key] = []; });
    projects.forEach(function (p) {
      if (!byStatus[p.status]) byStatus[p.status] = [];
      byStatus[p.status].push(p);
    });

    var html = '<div class="kanban-board">';
    Data.STATUSES.forEach(function (s) {
      var items = byStatus[s.key] || [];
      html += '<div class="kanban-column" data-status="' + s.key + '">';
      html += '<div class="kanban-column-header"><span>' + s.label + "</span><span class=\"kanban-count\">" + items.length + "</span></div>";
      html += '<div class="kanban-column-body" data-status-drop="' + s.key + '">';
      if (!items.length) {
        html += '<div class="kanban-empty">No projects</div>';
      } else {
        items.forEach(function (p) { html += renderCard(p); });
      }
      html += "</div></div>";
    });
    html += "</div>";
    container.innerHTML = html;

    attachDnD(container);
    attachClicks(container);
  }

  function attachClicks(container) {
    container.querySelectorAll(".kanban-card").forEach(function (card) {
      card.addEventListener("click", function () {
        App.openProjectDrawer(card.getAttribute("data-id"));
      });
    });
  }

  var draggedId = null;

  function attachDnD(container) {
    container.querySelectorAll(".kanban-card").forEach(function (card) {
      card.addEventListener("dragstart", function (e) {
        draggedId = card.getAttribute("data-id");
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", draggedId); } catch (err) {}
      });
      card.addEventListener("dragend", function () {
        card.classList.remove("dragging");
      });
    });

    container.querySelectorAll(".kanban-column-body").forEach(function (col) {
      col.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        col.classList.add("drop-target");
      });
      col.addEventListener("dragleave", function () {
        col.classList.remove("drop-target");
      });
      col.addEventListener("drop", function (e) {
        e.preventDefault();
        col.classList.remove("drop-target");
        var id = draggedId || (e.dataTransfer ? e.dataTransfer.getData("text/plain") : null);
        var newStatus = col.getAttribute("data-status-drop");
        if (id && newStatus) {
          App.updateProjectStatus(id, newStatus);
        }
        draggedId = null;
      });
    });
  }

  return { render: render, renderCard: renderCard, moduleChips: moduleChips, envLabel: envLabel, typeBadgeClass: typeBadgeClass, healthDotClass: healthDotClass };
})();
