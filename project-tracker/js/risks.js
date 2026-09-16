/* ==========================================================================
   Ankur's Project Tracker — risks.js
   Per-project risk register cards + the portfolio-wide Risks page table.
   ========================================================================== */

var Risks = (function () {
  "use strict";

  function scorePillClass(score) {
    if (score === "Critical") return "pill-critical";
    if (score === "High") return "pill-red";
    if (score === "Medium") return "pill-amber";
    return "pill-green"; // Low
  }

  function statusPillClass(status) {
    if (status === "Closed") return "pill-green";
    if (status === "Escalated") return "pill-critical";
    if (status === "Mitigating") return "pill-amber";
    if (status === "Accepted") return "pill-neutral";
    return "pill-neutral"; // Open
  }

  function sortBySeverity(risks) {
    return risks.slice().sort(function (a, b) {
      var rankDiff = (Data.RISK_SCORE_RANK[b.riskScore] || 0) - (Data.RISK_SCORE_RANK[a.riskScore] || 0);
      if (rankDiff !== 0) return rankDiff;
      return (a.targetResolutionDate || "").localeCompare(b.targetResolutionDate || "");
    });
  }

  // -------- per-project risk register (drawer) --------
  function renderProjectRisks(project, canDirect, canPropose) {
    var risks = project.risks || [];
    var showActions = canDirect || canPropose;
    var editLabel = canDirect ? "Edit" : "Propose edit";
    var deleteLabel = canDirect ? "Delete" : "Propose delete";

    if (!risks.length) {
      return '<div class="empty-state">No risks logged yet.' + (showActions ? ' Use "' + (canDirect ? "Add Risk" : "Propose Risk") + '" to start tracking one.' : "") + "</div>";
    }

    var html = '<div class="risk-list">';
    sortBySeverity(risks).forEach(function (r) {
      html += '<div class="risk-card">';
      html += '<div class="risk-card-head">';
      html += '<span class="pill ' + scorePillClass(r.riskScore) + '">' + App.esc(r.riskScore) + "</span>";
      html += '<span class="risk-category">' + App.esc(r.category) + "</span>";
      html += '<span class="pill ' + statusPillClass(r.status) + '">' + App.esc(r.status) + "</span>";
      html += "</div>";
      html += '<div class="risk-desc">' + App.esc(r.description) + "</div>";
      html += '<div class="risk-meta">';
      html += '<span class="meta-item">Likelihood: <strong>' + App.esc(r.likelihood) + "</strong></span>";
      html += '<span class="meta-item">Impact: <strong>' + App.esc(r.impact) + "</strong></span>";
      html += '<span class="meta-item">Owner: ' + App.esc(r.owner || "—") + "</span>";
      if (r.targetResolutionDate) html += '<span class="meta-item">Target: ' + Data.formatDate(r.targetResolutionDate) + "</span>";
      html += "</div>";
      if (r.mitigationPlan) html += '<div class="risk-mitigation"><span class="risk-mitigation-label">Mitigation:</span> ' + App.esc(r.mitigationPlan) + "</div>";
      if (showActions) {
        html += '<div class="risk-actions">' +
          '<button class="link-btn" data-edit-risk="' + r.id + '">' + editLabel + "</button>" +
          '<button class="link-btn link-danger" data-delete-risk="' + r.id + '">' + deleteLabel + "</button>" +
          "</div>";
      }
      html += "</div>";
    });
    html += "</div>";
    return html;
  }

  // -------- portfolio-wide risks page --------
  function flattenRisks(projects) {
    var rows = [];
    projects.forEach(function (p) {
      (p.risks || []).forEach(function (r) {
        rows.push({ project: p, risk: r });
      });
    });
    return rows;
  }

  function renderPortfolioRisks(container, projects, filters) {
    var rows = flattenRisks(projects);

    if (filters) {
      if (filters.category && filters.category !== "All") rows = rows.filter(function (r) { return r.risk.category === filters.category; });
      if (filters.status && filters.status !== "All") rows = rows.filter(function (r) { return r.risk.status === filters.status; });
      if (filters.score && filters.score !== "All") rows = rows.filter(function (r) { return r.risk.riskScore === filters.score; });
      if (filters.project && filters.project !== "All") rows = rows.filter(function (r) { return r.project.id === filters.project; });
    }

    rows.sort(function (a, b) {
      var rankDiff = (Data.RISK_SCORE_RANK[b.risk.riskScore] || 0) - (Data.RISK_SCORE_RANK[a.risk.riskScore] || 0);
      if (rankDiff !== 0) return rankDiff;
      return (a.risk.targetResolutionDate || "").localeCompare(b.risk.targetResolutionDate || "");
    });

    var html = '<div class="table-wrap"><table class="data-table">';
    html += "<thead><tr><th>Score</th><th>Client</th><th>Project</th><th>Category</th><th>Description</th><th>Status</th><th>Owner</th><th>Target</th></tr></thead><tbody>";

    if (!rows.length) {
      html += '<tr><td colspan="8" class="empty-cell">No risks match the current filters.</td></tr>';
    } else {
      rows.forEach(function (r) {
        html += "<tr>";
        html += "<td><span class=\"pill " + scorePillClass(r.risk.riskScore) + "\">" + App.esc(r.risk.riskScore) + "</span></td>";
        html += "<td>" + App.esc(r.project.client) + "</td>";
        html += '<td><a href="#" class="row-link" data-open-project="' + r.project.id + '">' + App.esc(r.project.projectName) + "</a></td>";
        html += "<td>" + App.esc(r.risk.category) + "</td>";
        html += "<td>" + App.esc(r.risk.description) + "</td>";
        html += "<td><span class=\"pill " + statusPillClass(r.risk.status) + "\">" + App.esc(r.risk.status) + "</span></td>";
        html += "<td>" + App.esc(r.risk.owner || "—") + "</td>";
        html += "<td>" + (r.risk.targetResolutionDate ? Data.formatDate(r.risk.targetResolutionDate) : "—") + "</td>";
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
    renderProjectRisks: renderProjectRisks,
    renderPortfolioRisks: renderPortfolioRisks,
    scorePillClass: scorePillClass,
    statusPillClass: statusPillClass
  };
})();
