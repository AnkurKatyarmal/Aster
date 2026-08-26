/* ==========================================================================
   IDfy Project Tracker — app.js
   Main application controller: auth gating, state, navigation, rendering,
   CRUD, modals, permissions, theme.
   ========================================================================== */

var App = (function () {
  "use strict";

  var state = {
    projects: [],
    page: "dashboard",
    selectedProjectId: null,
    filters: { type: "All", environment: "All", status: "All", health: "All", module: "All", dependencyOwner: "All" },
    search: "",
    globalTimelineFilters: {},
    teamDirectory: Data.DEFAULT_TEAM_DIRECTORY
  };

  function teamDirectoryNames() {
    var d = state.teamDirectory || Data.DEFAULT_TEAM_DIRECTORY;
    var all = (d.delivery || []).concat(d.salesPresales || []);
    return all.filter(function (n, i) { return n && all.indexOf(n) === i; }).sort();
  }

  // ---------------------------------------------------------------- utils
  function esc(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function findProject(id) {
    return state.projects.filter(function (p) { return p.id === id; })[0] || null;
  }

  function addAudit(project, text) {
    project.auditLog = project.auditLog || [];
    project.auditLog.unshift({ date: Data.todayStr(), text: text });
  }

  function perms() {
    if (!Auth.isEnabled()) return { canAddProjects: true, download: true, admin: true, isMember: false, isIntern: false, email: null };
    var s = Auth.state();
    return { canAddProjects: s.canAddProjects, download: s.canDownload, admin: s.isAdmin, isMember: s.isMember, isIntern: s.isIntern, email: s.email };
  }

  // Can this user edit/delete THIS specific project directly (no approval needed)?
  function canEditProject(project) {
    if (!Auth.isEnabled()) return true; // local mode: everyone has full access
    var s = Auth.state();
    if (s.isAdmin) return true;
    if (s.isMember) return !!(project && project.ownerEmail && project.ownerEmail === s.email);
    return false;
  }

  // Interns can't write directly, but they CAN open the edit/activity UI —
  // their submission just becomes a pending proposal instead of a live write.
  function isProposing() {
    return Auth.isEnabled() && Auth.state().isIntern;
  }

  function ownerDisplay(project) {
    if (!project || !project.ownerEmail) return "Unassigned";
    return project.owner || project.ownerEmail;
  }

  // ---------------------------------------------------------------- persistence helpers
  function persistAll() {
    if (!Storage.isCloud()) Storage.localSave(state.projects);
  }
  function persistProject(project) {
    if (Storage.isCloud()) Storage.saveProject(project); else persistAll();
  }
  function persistDelete(id) {
    if (Storage.isCloud()) Storage.deleteProject(id); else persistAll();
  }
  function replaceAllProjects(newList) {
    var previousIds = state.projects.map(function (p) { return p.id; });
    state.projects = newList;
    if (Storage.isCloud()) Storage.save(newList, previousIds); else Storage.localSave(newList);
    renderPage();
  }

  // ---------------------------------------------------------------- theme
  function initTheme() {
    var saved = null;
    try { saved = window.localStorage.getItem("idfy_theme"); } catch (e) {}
    var theme = saved || "dark";
    applyTheme(theme);
    $("#btnThemeToggle").addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    $("#btnThemeToggle").textContent = theme === "dark" ? "☀️" : "🌙";
    try { window.localStorage.setItem("idfy_theme", theme); } catch (e) {}
  }

  // ---------------------------------------------------------------- boot / auth gating
  function boot() {
    initTheme();
    $("#btnAddProject").addEventListener("click", function () {
      if (!perms().canAddProjects) return alert("You don't have permission to add projects.");
      openProjectForm(null);
    });
    attachModalBackdrop();
    attachSettingsButtons();

    if (Auth.isEnabled()) {
      $("#sidebarFooter").textContent = "Connected to shared cloud storage";
      Auth.onChange(handleAuthState);
      Auth.onPendingUserCountChange(updateUserPendingBadge);
      Auth.onPendingChangeCountChange(updateChangePendingBadge);
      Auth.init();
    } else {
      $("#sidebarFooter").textContent = "Data stored locally in this browser (local mode)";
      enterApp();
    }
  }

  function updateUserPendingBadge(count) {
    var badge = $("#pendingUserBadge");
    if (!badge) return;
    if (count > 0) { badge.textContent = count; badge.style.display = "inline-block"; }
    else { badge.style.display = "none"; }
  }

  function updateChangePendingBadge(count) {
    var badge = $("#pendingChangeBadge");
    if (!badge) return;
    if (count > 0) { badge.textContent = count; badge.style.display = "inline-block"; }
    else { badge.style.display = "none"; }
  }

  function handleAuthState(s) {
    if (!s.signedIn) return renderSignInScreen();
    if (s.isRejected) return renderRejectedScreen(s);
    if (s.isPending) return renderPendingScreen(s);
    if (s.isApproved) return enterApp(s);
    renderAuthLoadingScreen();
  }

  function showAuthScreen(bodyHtml) {
    $("#appShell").style.display = "none";
    $("#authScreen").style.display = "flex";
    $("#authScreenBody").innerHTML = bodyHtml;
  }

  function renderAuthLoadingScreen() {
    showAuthScreen('<p class="auth-copy">Loading…</p>');
  }

  function renderSignInScreen() {
    showAuthScreen(
      '<p class="auth-copy">Sign in with your Google account to access the shared project tracker.</p>' +
      '<button class="btn btn-primary btn-google" id="btnGoogleSignIn">Sign in with Google</button>'
    );
    $("#btnGoogleSignIn").addEventListener("click", function () {
      Auth.signIn().catch(function (e) { alert("Sign-in failed: " + e.message); });
    });
  }

  function renderPendingScreen(s) {
    showAuthScreen(
      '<p class="auth-copy">Thanks, ' + esc(s.profile.displayName) + ' — your access request is waiting for approval.</p>' +
      '<p class="auth-copy-sub">An admin needs to approve your account before you can view the tracker. This page will update automatically once you\'re approved.</p>' +
      '<button class="btn btn-ghost" id="btnSignOutPending">Sign out</button>'
    );
    $("#btnSignOutPending").addEventListener("click", function () { Auth.signOut(); });
  }

  function renderRejectedScreen(s) {
    showAuthScreen(
      '<p class="auth-copy">Your access request was declined.</p>' +
      '<p class="auth-copy-sub">If you think this is a mistake, reach out to your admin directly.</p>' +
      '<button class="btn btn-ghost" id="btnSignOutRejected">Sign out</button>'
    );
    $("#btnSignOutRejected").addEventListener("click", function () { Auth.signOut(); });
  }

  function enterApp(authState) {
    $("#authScreen").style.display = "none";
    $("#appShell").style.display = "flex";

    if (authState) {
      $("#topbarUser").style.display = "flex";
      $("#topbarUser").innerHTML =
        '<span class="user-chip" title="' + esc(authState.profile.email) + '">' +
        esc(authState.profile.displayName) +
        '<span class="role-tag">' + Auth.ROLE_LABELS[authState.role] + "</span></span>" +
        '<button class="btn btn-ghost btn-sm" id="btnSignOut">Sign out</button>';
      $("#btnSignOut").addEventListener("click", function () { Auth.signOut(); });

      $(".nav-admin-only").style.display = authState.isAdmin ? "flex" : "none";
      var showApprovals = authState.isAdmin || authState.role === "member" || authState.role === "intern";
      $(".nav-approvals").style.display = showApprovals ? "flex" : "none";
    }

    attachSidebarNavOnce();
    attachGlobalSearchOnce();

    Storage.subscribeTeamDirectory(function (dir) { state.teamDirectory = dir; if (state.page === "settings") renderPage(); });

    Storage.subscribe(function (list) {
      if (Storage.isCloud() && list.length === 0 && !state._cloudInitDone) {
        // leave empty — admin can Import or Reset to sample data from Settings
      }
      state._cloudInitDone = true;
      state.projects = list;
      renderPage();
    });

    if (!Auth.isEnabled() && !state.projects.length) {
      var loaded = Storage.localLoad();
      state.projects = (loaded && loaded.length) ? loaded : Data.sampleProjects();
      if (!loaded) Storage.localSave(state.projects);
      renderPage();
    }

    navigate(state.page || "dashboard");
  }

  var navAttached = false;
  function attachSidebarNavOnce() {
    if (navAttached) return;
    navAttached = true;
    $all(".nav-item").forEach(function (item) {
      item.addEventListener("click", function () { navigate(item.getAttribute("data-page")); });
    });
  }

  var searchAttached = false;
  function attachGlobalSearchOnce() {
    if (searchAttached) return;
    searchAttached = true;
    var input = $("#globalSearch");
    input.addEventListener("input", function () {
      state.search = input.value.trim().toLowerCase();
      if (state.page === "kanban" || state.page === "projects") renderPage();
    });
  }

  function attachModalBackdrop() {
    $("#modalBackdrop").addEventListener("click", function (e) { if (e.target.id === "modalBackdrop") closeModal(); });
    $("#drawerBackdrop").addEventListener("click", function (e) { if (e.target.id === "drawerBackdrop") closeDrawer(); });
  }

  // Bulk operations (import replaces the WHOLE shared dataset, reset/clear
  // wipe everyone's projects) are admin-only in cloud mode, since a member
  // or intern shouldn't be able to affect other members' projects this way.
  function canBulkManage() {
    return !Auth.isEnabled() || Auth.state().isAdmin;
  }

  function attachSettingsButtons() {
    $("#btnExport").addEventListener("click", function () { Storage.exportJSON(state.projects); });
    $("#btnDownloadTemplate").addEventListener("click", function () { Storage.downloadTemplate(); });
    $("#btnDownloadExcelTemplate").addEventListener("click", function () { ExcelIO.downloadTemplate(); });
    $("#btnImport").addEventListener("click", function () {
      if (!canBulkManage()) return alert("Only an admin can import data — it replaces the entire shared dataset.");
      $("#importFileInput").click();
    });
    $("#btnImportExcel").addEventListener("click", function () {
      if (!canBulkManage()) return alert("Only an admin can import data — it replaces the entire shared dataset.");
      $("#importExcelInput").click();
    });
    $("#importFileInput").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      Storage.importJSON(file, function (err, data) {
        if (err) { alert("Import failed:\n\n" + err.message); return; }
        replaceAllProjects(data);
        alert("Import complete — " + data.length + " project(s) loaded.");
      });
      e.target.value = "";
    });
    $("#importExcelInput").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      ExcelIO.importFile(file, function (err, data) {
        if (err) { alert("Import failed — please fix these and re-upload:\n\n" + err.message); return; }
        replaceAllProjects(data);
        alert("Import complete — " + data.length + " project(s) loaded from Excel.");
      });
      e.target.value = "";
    });
    $("#btnResetSample").addEventListener("click", function () {
      if (!canBulkManage()) return alert("Only an admin can reset to sample data.");
      if (confirm("Replace current data with fresh sample data? This cannot be undone.")) {
        replaceAllProjects(Data.sampleProjects());
      }
    });
    $("#btnClearAll").addEventListener("click", function () {
      if (!canBulkManage()) return alert("Only an admin can clear all data.");
      if (confirm("Delete ALL projects and activities? This cannot be undone.")) {
        replaceAllProjects([]);
      }
    });
  }

  function navigate(page) {
    state.page = page;
    $all(".nav-item").forEach(function (item) { item.classList.toggle("active", item.getAttribute("data-page") === page); });
    $all(".page-search-row").forEach(function (el) { el.style.display = (page === "kanban" || page === "projects") ? "flex" : "none"; });
    renderPage();
  }

  // ---------------------------------------------------------------- filtering
  function matchesFilters(p) {
    var f = state.filters;
    if (f.type !== "All" && p.projectType !== f.type) return false;
    if (f.environment !== "All") {
      var envLabel = p.environment === "Cloud" ? p.cloudProvider : p.environment;
      if (f.environment === "SaaS" && p.environment !== "SaaS") return false;
      if (f.environment === "On-Prem" && p.environment !== "On-Prem") return false;
      if (["AWS", "Azure", "GCP", "Other"].indexOf(f.environment) !== -1 && envLabel !== f.environment) return false;
    }
    if (f.status !== "All") {
      var statusKey = Data.STATUSES.filter(function (s) { return s.label === f.status; })[0];
      if (statusKey && p.status !== statusKey.key) return false;
    }
    if (f.health !== "All" && p.health !== f.health) return false;
    if (f.module !== "All" && (p.modules || []).indexOf(f.module) === -1) return false;
    if (f.dependencyOwner !== "All") {
      var dep = Data.currentDependency(p);
      if (!dep || dep.dependencySide !== f.dependencyOwner) return false;
    }
    if (state.search) {
      var haystack = [p.client, p.projectName, (p.modules || []).join(" "), p.owner, p.environment, p.cloudProvider].join(" ").toLowerCase();
      if (haystack.indexOf(state.search) === -1) return false;
    }
    return true;
  }
  function filteredProjects() { return state.projects.filter(matchesFilters); }

  // ---------------------------------------------------------------- page router
  function renderPage() {
    var main = $("#mainContent");
    if (!main) return;
    if (state.page !== "approvals" && unsubApprovals) { unsubApprovals(); unsubApprovals = null; }
    if (state.page === "dashboard") return renderDashboard(main);
    if (state.page === "kanban") return renderKanbanPage(main);
    if (state.page === "projects") return renderProjectsPage(main);
    if (state.page === "timeline") return renderTimelinePage(main);
    if (state.page === "analytics") return renderAnalyticsPage(main);
    if (state.page === "reports") return renderReportsPage(main);
    if (state.page === "approvals") return renderApprovalsPage(main);
    if (state.page === "access") return renderAccessPage(main);
    if (state.page === "settings") return renderSettingsPage(main);
  }
  var unsubApprovals = null;

  // ---------------------------------------------------------------- dashboard
  function scopedViewBanner() {
    if (!Auth.isEnabled()) return "";
    var s = Auth.state();
    if (s.role !== "member" || s.canViewAll) return "";
    return '<div class="viewonly-banner">Showing only projects you own. Ask an admin to grant "Full portfolio" view from Access Requests if you need to see everything.</div>';
  }

  function renderDashboard(main) {
    var projects = state.projects;
    var total = projects.length;
    var live = projects.filter(function (p) { return p.projectType === "LIVE"; }).length;
    var poc = projects.filter(function (p) { return p.projectType === "POC"; }).length;
    var blocked = projects.filter(function (p) { return p.status === "blocked"; }).length;
    var atRisk = projects.filter(function (p) { return p.health === "AT RISK"; }).length;
    var inProgress = projects.filter(function (p) { return p.status === "in-progress"; }).length;

    var clientWaiting = 0, internalWaiting = 0, activeWork = 0, totalElapsed = 0;
    projects.forEach(function (p) {
      var a = Data.calcProjectAnalytics(p);
      clientWaiting += a.clientWaiting; internalWaiting += a.internalWaiting;
      activeWork += a.activeWork; totalElapsed += a.totalElapsed;
    });

    function statCard(label, value, cls) {
      return '<div class="stat-card ' + (cls || "") + '"><div class="stat-value">' + value + '</div><div class="stat-label">' + label + "</div></div>";
    }

    var html = '<div class="page-header"><h1>IDfy Project Tracker</h1><p class="page-subtitle">Portfolio overview and delivery health</p></div>';
    html += scopedViewBanner();
    if (!projects.length) {
      html += '<div class="empty-state">No projects yet. ' + (perms().canAddProjects ? 'Use <strong>+ Add Project</strong>, or go to Settings to import data or load sample data.' : 'Ask an admin to add projects or grant you access.') + '</div>';
      main.innerHTML = html;
      return;
    }

    html += '<div class="stat-grid">';
    html += statCard("Total Projects", total);
    html += statCard("Live", live, "stat-green");
    html += statCard("POC", poc, "stat-purple");
    html += statCard("Blocked", blocked, "stat-red");
    html += statCard("At Risk", atRisk, "stat-amber");
    html += statCard("In Progress", inProgress, "stat-navy");
    html += "</div>";

    html += '<div class="stat-grid stat-grid-secondary">';
    html += statCard("Client Waiting (days)", clientWaiting, "stat-mono");
    html += statCard("Internal Waiting (days)", internalWaiting, "stat-mono");
    html += statCard("Active Work (days)", activeWork, "stat-mono");
    html += statCard("Total Elapsed (days)", totalElapsed, "stat-mono");
    html += "</div>";

    html += '<div class="section-title">At a Glance — Kanban</div><div id="dashboardKanban"></div>';
    main.innerHTML = html;
    Kanban.render($("#dashboardKanban"), projects.slice(0, 30), canEditProject);
  }

  // ---------------------------------------------------------------- kanban page
  function filterBarHtml() {
    var f = state.filters;
    function opts(list, current) {
      return ["All"].concat(list).map(function (v) { return '<option value="' + esc(v) + '"' + (v === current ? " selected" : "") + ">" + esc(v) + "</option>"; }).join("");
    }
    var envOptions = ["SaaS", "AWS", "Azure", "GCP", "On-Prem"];
    var statusOptions = Data.STATUSES.map(function (s) { return s.label; });
    return '<div class="filter-bar">' +
      '<select data-filter="type">' + opts(Data.PROJECT_TYPES, f.type) + "</select>" +
      '<select data-filter="environment">' + opts(envOptions, f.environment) + "</select>" +
      '<select data-filter="status">' + opts(statusOptions, f.status) + "</select>" +
      '<select data-filter="health">' + opts(Data.HEALTHS, f.health) + "</select>" +
      '<select data-filter="module">' + opts(Data.MODULES, f.module) + "</select>" +
      '<select data-filter="dependencyOwner">' + opts(Data.DEPENDENCY_SIDES, f.dependencyOwner) + "</select>" +
      '<button class="btn btn-ghost btn-sm" id="btnClearFilters">Clear filters</button></div>';
  }
  function attachFilterBar(root) {
    $all("[data-filter]", root).forEach(function (sel) {
      sel.addEventListener("change", function () { state.filters[sel.getAttribute("data-filter")] = sel.value; renderPage(); });
    });
    var clearBtn = $("#btnClearFilters", root);
    if (clearBtn) clearBtn.addEventListener("click", function () {
      state.filters = { type: "All", environment: "All", status: "All", health: "All", module: "All", dependencyOwner: "All" };
      renderPage();
    });
  }

  function renderKanbanPage(main) {
    var html = '<div class="page-header"><h1>Kanban</h1><p class="page-subtitle">Current state of every project — drag cards to update status</p></div>';
    html += scopedViewBanner();
    html += filterBarHtml();
    html += '<div id="kanbanContainer"></div>';
    main.innerHTML = html;
    attachFilterBar(main);
    Kanban.render($("#kanbanContainer"), filteredProjects(), canEditProject);
  }

  function updateProjectStatus(id, newStatus) {
    var project = findProject(id);
    if (!project) return;
    if (!canEditProject(project)) { alert(isProposing() ? "Interns can't change status directly — open the project and use Edit Project to propose a status change." : "You don't have edit access to this project."); renderPage(); return; }
    if (project.status === newStatus) return;
    var oldLabel = (Data.STATUSES.filter(function (s) { return s.key === project.status; })[0] || {}).label || project.status;
    var newLabel = (Data.STATUSES.filter(function (s) { return s.key === newStatus; })[0] || {}).label || newStatus;
    project.status = newStatus;
    addAudit(project, "Status changed: " + oldLabel + " → " + newLabel);
    persistProject(project);
    renderPage();
  }

  // ---------------------------------------------------------------- projects (table) page
  function renderProjectsPage(main) {
    var html = '<div class="page-header"><h1>Projects</h1><p class="page-subtitle">All projects in a sortable table view</p></div>';
    html += filterBarHtml();
    html += '<div class="table-wrap"><table class="data-table">';
    html += "<thead><tr><th>Client</th><th>Project</th><th>Type</th><th>Owner</th><th>Environment</th><th>Modules</th><th>Status</th><th>Health</th><th>Waiting</th><th></th></tr></thead><tbody>";

    var projects = filteredProjects();
    if (!projects.length) {
      html += '<tr><td colspan="10" class="empty-cell">No projects match the current filters.</td></tr>';
    } else {
      projects.forEach(function (p) {
        var a = Data.calcProjectAnalytics(p);
        var statusLabel = (Data.STATUSES.filter(function (s) { return s.key === p.status; })[0] || {}).label || p.status;
        html += "<tr>";
        html += "<td>" + esc(p.client) + "</td>";
        html += '<td><a href="#" class="row-link" data-open-project="' + p.id + '">' + esc(p.projectName) + "</a></td>";
        html += '<td><span class="badge ' + Kanban.typeBadgeClass(p.projectType) + '">' + p.projectType + "</span></td>";
        html += "<td>" + esc(ownerDisplay(p)) + "</td>";
        html += "<td>" + esc(Kanban.envLabel(p)) + "</td>";
        html += '<td><div class="chip-row">' + Kanban.moduleChips(p.modules) + "</div></td>";
        html += "<td>" + esc(statusLabel) + "</td>";
        html += '<td><span class="health-dot ' + Kanban.healthDotClass(p.health) + '"></span> ' + esc(p.health) + "</td>";
        html += "<td>" + (a.totalWaiting > 0 ? a.totalWaiting + "d" : "—") + "</td>";
        html += "<td>" + (canEditProject(p) ? '<button class="link-btn link-danger" data-delete-project="' + p.id + '">Delete</button>' : "") + "</td>";
        html += "</tr>";
      });
    }
    html += "</tbody></table></div>";
    main.innerHTML = html;
    attachFilterBar(main);
    $all("[data-open-project]", main).forEach(function (el) { el.addEventListener("click", function (e) { e.preventDefault(); openProjectDrawer(el.getAttribute("data-open-project")); }); });
    $all("[data-delete-project]", main).forEach(function (el) { el.addEventListener("click", function () { confirmDeleteProject(el.getAttribute("data-delete-project")); }); });
  }

  // ---------------------------------------------------------------- timeline page
  function renderTimelinePage(main) {
    var clients = state.projects.map(function (p) { return p.client; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
    var html = '<div class="page-header"><h1>Timeline</h1><p class="page-subtitle">Every activity, across every project, in chronological order</p></div>';
    html += '<div class="filter-bar">';
    html += '<select id="tlClient"><option value="">All clients</option>' + clients.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("") + "</select>";
    html += '<select id="tlOwnerType"><option value="">All owner types</option>' + Data.OWNER_TYPES.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") + "</select>";
    html += '<select id="tlActivityType"><option value="">All activity types</option>' + Data.ACTIVITY_TYPES.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") + "</select>";
    html += '<select id="tlStatus"><option value="">All statuses</option>' + Data.ACTIVITY_STATUSES.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") + "</select>";
    html += '<input type="date" id="tlDateFrom" title="From date"><input type="date" id="tlDateTo" title="To date">';
    html += '<button class="btn btn-ghost btn-sm" id="btnClearTlFilters">Clear filters</button></div>';
    html += '<div id="globalTimelineContainer"></div>';
    main.innerHTML = html;

    function apply() {
      state.globalTimelineFilters = {
        client: $("#tlClient").value, ownerType: $("#tlOwnerType").value, activityType: $("#tlActivityType").value,
        status: $("#tlStatus").value, dateFrom: $("#tlDateFrom").value, dateTo: $("#tlDateTo").value
      };
      Timeline.renderGlobalTimeline($("#globalTimelineContainer"), state.projects, state.globalTimelineFilters);
    }
    ["tlClient", "tlOwnerType", "tlActivityType", "tlStatus", "tlDateFrom", "tlDateTo"].forEach(function (id) { $("#" + id).addEventListener("change", apply); });
    $("#btnClearTlFilters").addEventListener("click", function () {
      ["tlClient", "tlOwnerType", "tlActivityType", "tlStatus", "tlDateFrom", "tlDateTo"].forEach(function (id) { $("#" + id).value = ""; });
      apply();
    });
    apply();
  }

  // ---------------------------------------------------------------- analytics page
  function renderAnalyticsPage(main) {
    var html = '<div class="page-header"><h1>Analytics</h1><p class="page-subtitle">Portfolio distribution and dependency accountability</p></div>';
    html += '<div id="analyticsContainer"></div>';
    main.innerHTML = html;
    Analytics.render($("#analyticsContainer"), state.projects);
  }

  // ---------------------------------------------------------------- reports page
  function renderReportsPage(main) {
    var p2 = perms();
    var html = '<div class="page-header"><h1>Reports</h1><p class="page-subtitle">Generate a print-ready report — use your browser\'s "Save as PDF" print destination</p></div>';

    if (!p2.download) {
      html += '<div class="empty-state">Your access level doesn\'t include downloading reports. Ask an admin for Viewer + Download or Editor access.</div>';
      main.innerHTML = html;
      return;
    }

    html += '<div class="settings-card"><h3>Project Report</h3><p>A full delivery report for a single project — info, current dependency, waiting-time analytics, and the complete activity timeline.</p>';
    html += '<div class="settings-actions">';
    html += '<select id="reportProjectSelect">' + state.projects.map(function (p) { return '<option value="' + p.id + '">' + esc(p.client) + " — " + esc(p.projectName) + "</option>"; }).join("") + "</select>";
    html += '<button class="btn btn-primary" id="btnGenProjectReport">Generate Project Report</button>';
    html += "</div></div>";

    html += '<div class="settings-card"><h3>POC Templates</h3><p>Pick a module for a pre-filled scope document or completion report — edit anything before generating.</p>';
    html += '<div class="settings-actions">';
    html += '<button class="btn btn-primary" id="btnNewPoc">+ New POC (Kickoff Document)</button>';
    html += '<button class="btn btn-secondary" id="btnPocCompletion">POC Completion Report</button>';
    html += "</div></div>";

    var todayStr = Data.todayStr();
    var weekAgo = new Date(Data.parseDate(todayStr).getTime() - 6 * 86400000).toISOString().slice(0, 10);
    html += '<div class="settings-card"><h3>Weekly Status Update</h3><p>Portfolio-wide status summary and all activity logged within a date range, across every project.</p>';
    html += '<div class="settings-actions">';
    html += '<input type="date" id="weeklyFrom" value="' + weekAgo + '"> <input type="date" id="weeklyTo" value="' + todayStr + '">';
    html += '<button class="btn btn-primary" id="btnGenWeeklyReport">Generate Weekly Report</button>';
    html += "</div></div>";

    main.innerHTML = html;

    $("#btnNewPoc").addEventListener("click", openNewPocModal);
    $("#btnPocCompletion").addEventListener("click", openPocCompletionModal);

    if (!state.projects.length) return;
    $("#btnGenProjectReport").addEventListener("click", function () {
      var project = findProject($("#reportProjectSelect").value);
      if (project) Reports.projectReport(project);
    });
    $("#btnGenWeeklyReport").addEventListener("click", function () {
      Reports.weeklyReport(state.projects, $("#weeklyFrom").value, $("#weeklyTo").value);
    });
  }

  // ---------------------------------------------------------------- POC templates: New POC (kickoff)
  function openNewPocModal() {
    var modules = PocTemplates.list();
    var mod = modules[0];
    var s = Auth.isEnabled() ? Auth.state() : null;
    var proposing = isProposing();
    var showOwnerPicker = Auth.isEnabled() && s && (s.isAdmin || proposing);

    function renderForm(ownerCandidates) {
      var html = '<div class="modal-header"><h2>' + (proposing ? "Propose New POC — Kickoff Document" : "New POC — Kickoff Document") + '</h2><button class="drawer-close" id="modalCloseBtn">&times;</button></div>';
      html += '<form id="pocForm" class="form-grid">';
      html += formField("Module", selectHtml("poc_module", modules.map(function (m) { return m.label; }), mod.label, true));
      html += formField("Client Name", '<input type="text" id="poc_client" required>');
      html += formField("Project Name", '<input type="text" id="poc_projectName" placeholder="e.g. Consent Governance POC" required>');

      if (showOwnerPicker) {
        var options = ownerCandidates.map(function (u) { return '<option value="' + esc(u.email) + '" data-name="' + esc(u.displayName) + '">' + esc(u.displayName) + " (" + esc(u.email) + ")</option>"; }).join("");
        html += formField(proposing ? "Assign to (who will review/own this)" : "POC Owner", '<select id="poc_ownerEmail" required><option value="">— Select —</option>' + options + "</select>");
      } else {
        html += formField("POC Owner", '<input type="text" value="' + esc(s ? s.profile.displayName : "You") + '" disabled>');
      }

      html += formField("Environment", selectHtml("poc_environment", Data.ENV_TYPES, "SaaS", true));
      html += formField("Cloud Provider", selectHtml("poc_cloudProvider", Data.CLOUD_PROVIDERS, "AWS"), "poc_cloudProviderRow");
      html += formField("Start Date", '<input type="date" id="poc_startDate" value="' + Data.todayStr() + '" required>');
      html += formField("Target Completion", '<input type="date" id="poc_targetDate">');
      html += formField("Objective", '<textarea id="poc_objective" rows="2">' + esc(mod.kickoff.objective) + "</textarea>", null, true);
      html += formField("Scope (one item per line)", '<textarea id="poc_scope" rows="5">' + esc(mod.kickoff.scope) + "</textarea>", null, true);
      html += formField("Indicative Timeline (one item per line)", '<textarea id="poc_timeline" rows="4">' + esc(mod.kickoff.timeline) + "</textarea>", null, true);
      html += formField("Success Criteria (one item per line)", '<textarea id="poc_successCriteria" rows="4">' + esc(mod.kickoff.successCriteria) + "</textarea>", null, true);
      html += formField("Assumptions & Exclusions (one item per line)", '<textarea id="poc_assumptions" rows="4">' + esc(mod.kickoff.assumptions) + "</textarea>", null, true);
      if (!proposing) html += '<div class="form-field form-field-full"><label class="ms-option" style="text-transform:none;"><input type="checkbox" id="poc_alsoCreate" checked> Also add this as a new POC project in the tracker</label></div>';
      else html += '<div class="form-field form-field-full"><div class="empty-state">The project and its kickoff details will be submitted for approval. The document below generates immediately either way — approval only affects whether it shows up as a live project in the tracker.</div></div>';
      html += '<div class="form-actions"><button type="button" class="btn btn-ghost" id="btnCancelPoc">Cancel</button><button type="submit" class="btn btn-primary">Generate Kickoff Document</button></div>';
      html += "</form>";
      openModal(html);

      function toggleCloudRow() { var row = $("#poc_cloudProviderRow"); if (row) row.style.display = $("#poc_environment").value === "Cloud" ? "" : "none"; }
      $("#poc_environment").addEventListener("change", toggleCloudRow);
      toggleCloudRow();

      $("#poc_module").addEventListener("change", function () {
        var m = modules.filter(function (x) { return x.label === $("#poc_module").value; })[0];
        if (!m) return;
        $("#poc_objective").value = m.kickoff.objective;
        $("#poc_scope").value = m.kickoff.scope;
        $("#poc_timeline").value = m.kickoff.timeline;
        $("#poc_successCriteria").value = m.kickoff.successCriteria;
        $("#poc_assumptions").value = m.kickoff.assumptions;
      });

      $("#modalCloseBtn").addEventListener("click", closeModal);
      $("#btnCancelPoc").addEventListener("click", closeModal);

      $("#pocForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var selectedMod = modules.filter(function (x) { return x.label === $("#poc_module").value; })[0] || mod;
        var environment = $("#poc_environment").value;
        var cloudProvider = environment === "Cloud" ? $("#poc_cloudProvider").value : "";

        var ownerEmail, ownerName;
        if (showOwnerPicker) {
          var sel = $("#poc_ownerEmail");
          var opt = sel.options[sel.selectedIndex];
          if (!sel.value) { alert("Please assign an owner."); return; }
          ownerEmail = sel.value; ownerName = opt ? opt.getAttribute("data-name") : sel.value;
        } else {
          ownerEmail = s ? s.email : ""; ownerName = s ? s.profile.displayName : "";
        }

        var fields = {
          client: $("#poc_client").value.trim(),
          projectName: $("#poc_projectName").value.trim(),
          owner: ownerName,
          environment: environment === "Cloud" ? ("Cloud — " + cloudProvider) : environment,
          startDate: $("#poc_startDate").value,
          targetDate: $("#poc_targetDate").value,
          moduleLabel: selectedMod.label,
          objective: $("#poc_objective").value.trim(),
          scope: $("#poc_scope").value,
          timeline: $("#poc_timeline").value,
          successCriteria: $("#poc_successCriteria").value,
          assumptions: $("#poc_assumptions").value
        };

        if (!fields.client || !fields.projectName) { alert("Client Name and Project Name are required."); return; }

        var newProjectPayload = {
          client: fields.client,
          projectName: fields.projectName,
          projectType: "POC",
          environment: environment,
          cloudProvider: cloudProvider,
          infrastructureOwnership: "IDfy",
          owner: ownerName,
          ownerEmail: ownerEmail,
          ownerType: "Project / PM",
          startDate: fields.startDate,
          targetDate: fields.targetDate,
          status: "planned",
          health: "ON TRACK",
          modules: [selectedMod.dataModule],
          description: fields.objective
        };

        if (proposing) {
          Auth.submitPendingChange({
            type: "create_project",
            targetProjectId: null,
            targetOwnerEmail: ownerEmail,
            clientLabel: fields.client + " — " + fields.projectName,
            payload: newProjectPayload
          }).then(function () {
            closeModal();
            Reports.pocKickoffReport(fields);
            alert("Project submitted for approval. The kickoff document has still been generated for you to share.");
          }).catch(function (err) { alert("Couldn't submit: " + err.message); });
          return;
        }

        if (!showOwnerPicker || $("#poc_alsoCreate").checked) {
          newProjectPayload.id = Data.generateId("proj");
          newProjectPayload.activities = [{
            id: Data.generateId("act"),
            date: fields.startDate,
            activityType: "MEETING",
            description: "POC kickoff — scope document generated",
            ownerType: "PROJECT / PM",
            owner: fields.owner,
            dependencySide: "Internal",
            requestedBy: "", requestedDate: "", expectedDate: "", receivedDate: "",
            status: "COMPLETED", impact: "", relatedPhase: "Kickoff", notes: ""
          }];
          newProjectPayload.auditLog = [{ date: Data.todayStr(), text: "Project created from New POC template (" + selectedMod.label + ")" }];
          state.projects.push(newProjectPayload);
          persistProject(newProjectPayload);
        }

        closeModal();
        Reports.pocKickoffReport(fields);
        if (["dashboard", "kanban", "projects"].indexOf(state.page) !== -1) renderPage();
      });
    }

    if (showOwnerPicker) Auth.listOwnerCandidates(renderForm);
    else renderForm([]);
  }

  // ---------------------------------------------------------------- POC templates: Completion Report
  function openPocCompletionModal() {
    var modules = PocTemplates.list();
    var linkedProject = null;

    var html = '<div class="modal-header"><h2>POC Completion Report</h2><button class="drawer-close" id="modalCloseBtn">&times;</button></div>';
    html += '<form id="pocCompletionForm" class="form-grid">';
    if (state.projects.length) {
      html += formField("Link to existing project (optional)", '<select id="pocc_linkProject"><option value="">— Manual entry —</option>' +
        state.projects.map(function (p) { return '<option value="' + p.id + '">' + esc(p.client) + " — " + esc(p.projectName) + "</option>"; }).join("") + "</select>", null, true);
    }
    html += formField("Module", selectHtml("pocc_module", modules.map(function (m) { return m.label; }), modules[0].label, true));
    html += formField("Client Name", '<input type="text" id="pocc_client" required>');
    html += formField("Project Name", '<input type="text" id="pocc_projectName" required>');
    html += formField("Owner", '<input type="text" id="pocc_owner">');
    html += formField("Start Date", '<input type="date" id="pocc_startDate">');
    html += formField("Completion Date", '<input type="date" id="pocc_completionDate" value="' + Data.todayStr() + '">');
    html += '<div class="form-field form-field-full" id="pocc_metricsFields"></div>';
    html += formField("Key Findings (one item per line)", '<textarea id="pocc_findings" rows="4"></textarea>', null, true);
    html += formField("Recommendation", '<textarea id="pocc_recommendation" rows="2"></textarea>', null, true);
    html += formField("Next Steps (one item per line)", '<textarea id="pocc_nextSteps" rows="4"></textarea>', null, true);
    html += '<div class="form-actions"><button type="button" class="btn btn-ghost" id="btnCancelPocc">Cancel</button><button type="submit" class="btn btn-primary">Generate Completion Report</button></div>';
    html += "</form>";
    openModal(html);

    function renderMetricsFields(mod) {
      var el = $("#pocc_metricsFields");
      el.innerHTML = '<label>Metrics</label><div class="form-grid" style="padding:0;">' +
        mod.completion.metricFields.map(function (m) {
          return '<div class="form-field"><label>' + esc(m.label) + '</label><input type="text" data-metric-key="' + m.key + '" placeholder="e.g. 12,480"></div>';
        }).join("") + "</div>";
    }
    function applyModuleDefaults(mod) {
      renderMetricsFields(mod);
      $("#pocc_findings").value = mod.completion.findings;
      $("#pocc_recommendation").value = mod.completion.recommendation;
      $("#pocc_nextSteps").value = mod.completion.nextSteps;
    }
    applyModuleDefaults(modules[0]);

    $("#pocc_module").addEventListener("change", function () {
      var m = modules.filter(function (x) { return x.label === $("#pocc_module").value; })[0];
      if (m) applyModuleDefaults(m);
    });

    var linkSel = $("#pocc_linkProject");
    if (linkSel) {
      linkSel.addEventListener("change", function () {
        linkedProject = findProject(linkSel.value);
        if (!linkedProject) return;
        $("#pocc_client").value = linkedProject.client;
        $("#pocc_projectName").value = linkedProject.projectName;
        $("#pocc_owner").value = linkedProject.owner || "";
        $("#pocc_startDate").value = linkedProject.startDate || "";
        var matchMod = modules.filter(function (m) { return (linkedProject.modules || []).indexOf(m.dataModule) !== -1; })[0];
        if (matchMod) { $("#pocc_module").value = matchMod.label; applyModuleDefaults(matchMod); }
      });
    }

    $("#modalCloseBtn").addEventListener("click", closeModal);
    $("#btnCancelPocc").addEventListener("click", closeModal);

    $("#pocCompletionForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var selectedMod = modules.filter(function (x) { return x.label === $("#pocc_module").value; })[0] || modules[0];
      var metrics = selectedMod.completion.metricFields.map(function (m) {
        var input = $('[data-metric-key="' + m.key + '"]');
        return { label: m.label, value: input ? input.value.trim() : "" };
      });

      var fields = {
        client: $("#pocc_client").value.trim(),
        projectName: $("#pocc_projectName").value.trim(),
        owner: $("#pocc_owner").value.trim(),
        startDate: $("#pocc_startDate").value,
        completionDate: $("#pocc_completionDate").value,
        moduleLabel: selectedMod.label,
        metrics: metrics,
        findings: $("#pocc_findings").value,
        recommendation: $("#pocc_recommendation").value.trim(),
        nextSteps: $("#pocc_nextSteps").value
      };
      if (!fields.client || !fields.projectName) { alert("Client Name and Project Name are required."); return; }

      closeModal();
      Reports.pocCompletionReport(fields);
    });
  }

  // ---------------------------------------------------------------- approvals (maker-checker)
  var CHANGE_TYPE_LABELS = {
    create_project: "New Project", edit_project: "Edit Project", delete_project: "Delete Project",
    add_activity: "Add Activity", edit_activity: "Edit Activity", delete_activity: "Delete Activity"
  };

  function describeChangePayload(change) {
    if (change.type === "create_project" || change.type === "edit_project") {
      return "Status: " + esc(change.payload.status) + " · Health: " + esc(change.payload.health) + (change.payload.description ? " · " + esc(change.payload.description) : "");
    }
    if (change.type === "add_activity" || change.type === "edit_activity") {
      return esc(change.payload.activityType) + " — " + esc(change.payload.description);
    }
    if (change.type === "delete_activity") return "Delete: " + esc(change.payload.description);
    if (change.type === "delete_project") return "Delete this project and all its activity history";
    return "";
  }

  function applyApprovedChange(change) {
    if (change.type === "create_project") {
      var newProject = Object.assign({}, change.payload, {
        id: Data.generateId("proj"),
        activities: [],
        auditLog: [{ date: Data.todayStr(), text: "Project created (approved from " + change.submittedByName + "'s proposal)" }]
      });
      state.projects.push(newProject);
      persistProject(newProject);
      return;
    }
    var project = findProject(change.targetProjectId);
    if (!project) { alert("The target project for this change no longer exists."); return; }

    if (change.type === "edit_project") {
      Object.assign(project, change.payload);
      addAudit(project, "Edit approved (proposed by " + change.submittedByName + ")");
      persistProject(project);
    } else if (change.type === "delete_project") {
      state.projects = state.projects.filter(function (p) { return p.id !== project.id; });
      persistDelete(project.id);
    } else if (change.type === "add_activity") {
      project.activities = project.activities || [];
      var act = Object.assign({}, change.payload, { id: Data.generateId("act") });
      project.activities.push(act);
      addAudit(project, "Activity added (approved from " + change.submittedByName + "'s proposal): " + act.description);
      persistProject(project);
    } else if (change.type === "edit_activity") {
      var target = (project.activities || []).filter(function (a) { return a.id === change.payload.activityId; })[0];
      if (target) Object.assign(target, change.payload);
      addAudit(project, "Activity edit approved (proposed by " + change.submittedByName + ")");
      persistProject(project);
    } else if (change.type === "delete_activity") {
      project.activities = (project.activities || []).filter(function (a) { return a.id !== change.payload.activityId; });
      addAudit(project, "Activity deletion approved (proposed by " + change.submittedByName + "): " + change.payload.description);
      persistProject(project);
    }
  }

  function renderApprovalsPage(main) {
    if (!Auth.isEnabled()) {
      main.innerHTML = '<div class="page-header"><h1>Approvals</h1><p class="page-subtitle">Maker-checker queue for proposed changes</p></div>' +
        '<div class="empty-state">Approvals only apply in cloud mode.</div>';
      return;
    }
    var s = Auth.state();
    if (!(s.isAdmin || s.role === "member" || s.role === "intern")) {
      main.innerHTML = '<div class="empty-state">Not applicable to your role.</div>';
      return;
    }

    var isReviewer = s.isAdmin || s.role === "member";
    var html = '<div class="page-header"><h1>Approvals</h1><p class="page-subtitle">' +
      (isReviewer ? "Review and approve or reject proposed changes" : "Status of the changes you've submitted") + '</p></div>';
    html += '<div id="approvalsList"></div>';
    main.innerHTML = html;

    if (unsubApprovals) { unsubApprovals(); unsubApprovals = null; }
    unsubApprovals = Auth.listPendingChangesFor(s.profile, function (rows) {
      var el = $("#approvalsList");
      if (!rows.length) { el.innerHTML = '<div class="empty-state">' + (isReviewer ? "Nothing waiting for your review." : "You haven't submitted any changes yet.") + '</div>'; return; }

      var h = '<div class="table-wrap"><table class="data-table"><thead><tr><th>Type</th><th>Project</th><th>Details</th><th>Submitted By</th><th>Status</th>' + (isReviewer ? "<th></th>" : "") + "</tr></thead><tbody>";
      rows.forEach(function (c) {
        h += "<tr>";
        h += "<td>" + esc(CHANGE_TYPE_LABELS[c.type] || c.type) + "</td>";
        h += "<td>" + esc(c.clientLabel) + "</td>";
        h += "<td>" + describeChangePayload(c) + "</td>";
        h += "<td>" + esc(c.submittedByName) + "</td>";
        h += "<td>" + Timeline.statusPill((c.status || "pending").toUpperCase()) + "</td>";
        if (isReviewer) {
          h += "<td>" + (c.status === "pending"
            ? '<button class="btn btn-primary btn-sm" data-approve-change="' + c.id + '">Approve</button> <button class="btn btn-ghost btn-sm" data-reject-change="' + c.id + '">Reject</button>'
            : "") + "</td>";
        }
        h += "</tr>";
      });
      h += "</tbody></table></div>";
      el.innerHTML = h;

      $all("[data-approve-change]", el).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var change = rows.filter(function (r) { return r.id === btn.getAttribute("data-approve-change"); })[0];
          if (!change) return;
          applyApprovedChange(change);
          Auth.markChangeReviewed(change.id, "approved");
        });
      });
      $all("[data-reject-change]", el).forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Reject this proposed change?")) return;
          Auth.markChangeReviewed(btn.getAttribute("data-reject-change"), "rejected");
        });
      });
    });
  }

  // ---------------------------------------------------------------- access requests (admin) page
  function renderAccessPage(main) {
    if (!Auth.isEnabled()) {
      main.innerHTML = '<div class="page-header"><h1>Access Requests</h1><p class="page-subtitle">Approve new sign-ins and manage roles</p></div>' +
        '<div class="empty-state">Access Requests only apply in cloud mode. Fill in <code>js/firebase-config.js</code> with your Firebase project to enable Google sign-in and the approval workflow — see README.</div>';
      return;
    }
    if (!perms().admin) {
      main.innerHTML = '<div class="empty-state">Admins only.</div>';
      return;
    }
    var html = '<div class="page-header"><h1>Access Requests</h1><p class="page-subtitle">Approve new sign-ins and manage roles</p></div>';

    html += '<div class="settings-card"><h3>Invite someone</h3><p>Pre-approve an email with a role — the moment they sign in with that Google account, they land straight in with no waiting screen.</p>';
    html += '<div class="settings-actions">';
    html += '<input type="email" id="inviteEmail" placeholder="name@company.com" style="flex:1;min-width:220px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;">';
    html += '<select id="inviteRole">' + Auth.ROLES.map(function (r) { return '<option value="' + r + '">' + Auth.ROLE_LABELS[r] + "</option>"; }).join("") + "</select>";
    html += '<button class="btn btn-primary btn-sm" id="btnSendInvite">Send Invite</button>';
    html += '</div><div id="invitesListSection" style="margin-top:14px;"></div></div>';

    html += '<div id="pendingSection"></div><div class="section-title">All Users</div><div id="allUsersSection"></div>';
    main.innerHTML = html;

    $("#btnSendInvite").addEventListener("click", function () {
      var email = $("#inviteEmail").value.trim();
      if (!email || email.indexOf("@") === -1) return alert("Enter a valid email address.");
      Auth.createInvite(email, $("#inviteRole").value).then(function () {
        $("#inviteEmail").value = "";
        refreshInvites();
      });
    });

    function refreshInvites() {
      Auth.listInvites(function (rows) {
        var el = $("#invitesListSection");
        if (!rows.length) { el.innerHTML = '<div class="empty-state">No pending invites.</div>'; return; }
        var h = '<div class="table-wrap"><table class="data-table"><thead><tr><th>Email</th><th>Role</th><th>Invited By</th><th></th></tr></thead><tbody>';
        rows.forEach(function (inv) {
          h += "<tr><td>" + esc(inv.email) + "</td><td>" + esc(Auth.ROLE_LABELS[inv.role] || inv.role) + "</td><td>" + esc(inv.invitedBy) + "</td>" +
            '<td><button class="link-btn link-danger" data-cancel-invite="' + esc(inv.email) + '">Cancel invite</button></td></tr>';
        });
        h += "</tbody></table></div>";
        el.innerHTML = h;
        $all("[data-cancel-invite]", el).forEach(function (btn) {
          btn.addEventListener("click", function () {
            if (!confirm("Cancel this invite?")) return;
            Auth.cancelInvite(btn.getAttribute("data-cancel-invite")).then(refreshInvites);
          });
        });
      });
    }
    refreshInvites();

    Auth.listPendingUsers(function (rows) {
      var el = $("#pendingSection");
      if (!rows.length) { el.innerHTML = '<div class="empty-state">No pending requests.</div>'; return; }
      var h = '<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Grant Access As</th><th></th></tr></thead><tbody>';
      rows.forEach(function (u) {
        h += "<tr><td>" + esc(u.displayName) + "</td><td>" + esc(u.email) + "</td>" +
          '<td><select data-role-select="' + u.uid + '">' +
          Auth.ROLES.filter(function (r) { return r !== "admin"; }).map(function (r) { return '<option value="' + r + '">' + Auth.ROLE_LABELS[r] + "</option>"; }).join("") +
          "</select></td>" +
          '<td><button class="btn btn-primary btn-sm" data-approve="' + u.uid + '">Approve</button> <button class="btn btn-ghost btn-sm" data-reject="' + u.uid + '">Reject</button></td></tr>';
      });
      h += "</tbody></table></div>";
      el.innerHTML = h;
      $all("[data-approve]", el).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var uid = btn.getAttribute("data-approve");
          var role = $('[data-role-select="' + uid + '"]', el).value;
          Auth.approveUser(uid, role).then(function () { renderAccessPage(main); });
        });
      });
      $all("[data-reject]", el).forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Reject this access request?")) return;
          Auth.rejectUser(btn.getAttribute("data-reject")).then(function () { renderAccessPage(main); });
        });
      });
    });

    Auth.listAllUsers(function (rows) {
      var el = $("#allUsersSection");
      var h = '<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Role</th><th>View</th><th></th></tr></thead><tbody>';
      rows.forEach(function (u) {
        h += "<tr><td>" + esc(u.displayName) + "</td><td>" + esc(u.email) + "</td><td>" + esc(u.status) + "</td>";
        h += "<td>" + (u.role === "admin" ? "Admin" :
          '<select data-change-role="' + u.uid + '">' +
          Auth.ROLES.filter(function (r) { return r !== "admin"; }).map(function (r) { return '<option value="' + r + '"' + (r === u.role ? " selected" : "") + '>' + Auth.ROLE_LABELS[r] + "</option>"; }).join("") +
          "</select>") + "</td>";
        if (u.role === "member" && u.status === "approved") {
          h += '<td><label class="ms-option" style="text-transform:none;font-size:12px;"><input type="checkbox" data-full-view="' + u.uid + '"' + (u.canViewAll ? " checked" : "") + '> Full portfolio</label></td>';
        } else {
          h += "<td><span style=\"color:var(--ink-soft);font-size:11.5px;\">" + (u.role === "member" ? "Own projects only" : "All projects") + "</span></td>";
        }
        h += "<td>" + (u.status === "approved" && u.role !== "admin" ? '<button class="link-btn link-danger" data-revoke="' + u.uid + '">Revoke</button>' : "") + "</td></tr>";
      });
      h += "</tbody></table></div>";
      el.innerHTML = h;
      $all("[data-change-role]", el).forEach(function (sel) {
        sel.addEventListener("change", function () { Auth.changeRole(sel.getAttribute("data-change-role"), sel.value).then(function () { renderAccessPage(main); }); });
      });
      $all("[data-full-view]", el).forEach(function (chk) {
        chk.addEventListener("change", function () { Auth.grantFullView(chk.getAttribute("data-full-view"), chk.checked); });
      });
      $all("[data-revoke]", el).forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Revoke this user's access? They'll need to be re-approved.")) return;
          Auth.revokeUser(btn.getAttribute("data-revoke")).then(function () { renderAccessPage(main); });
        });
      });
    });
  }

  // ---------------------------------------------------------------- settings page
  // Deliberately curated for the PUBLIC dashboard — no emails, no
  // dependency descriptions/notes/impact text, no activity history, no
  // audit log. Just enough for a leadership-level status view.
  function buildPublicSnapshot() {
    var projects = state.projects.map(function (p) {
      var a = Data.calcProjectAnalytics(p);
      var dep = Data.currentDependency(p);
      var statusLabel = (Data.STATUSES.filter(function (s) { return s.key === p.status; })[0] || {}).label || p.status;
      var lastActivity = (p.activities || []).slice().sort(function (x, y) { return (x.date || "").localeCompare(y.date || ""); }).pop();
      return {
        client: p.client,
        projectName: p.projectName,
        projectType: p.projectType,
        environment: Kanban.envLabel(p),
        modules: p.modules || [],
        statusLabel: statusLabel,
        health: p.health,
        progress: Data.progressFor(p),
        owner: p.owner || "",
        ownerType: p.ownerType || "",
        startDate: p.startDate || "",
        targetDate: p.targetDate || "",
        lastActivityDate: lastActivity ? lastActivity.date : "",
        description: p.description || "",
        totalWaitingDays: a.totalWaiting,
        clientWaitingDays: a.clientWaiting,
        internalWaitingDays: a.internalWaiting,
        hasOpenDependency: !!dep
      };
    });
    var total = projects.length;
    var stats = {
      total: total,
      live: projects.filter(function (p) { return p.projectType === "LIVE"; }).length,
      poc: projects.filter(function (p) { return p.projectType === "POC"; }).length,
      blocked: state.projects.filter(function (p) { return p.status === "blocked"; }).length,
      atRisk: state.projects.filter(function (p) { return p.health === "AT RISK"; }).length,
      inProgress: state.projects.filter(function (p) { return p.status === "in-progress"; }).length
    };
    return { stats: stats, projects: projects };
  }

  function renderSettingsPage(main) {
    var p2 = perms();
    var html = '<div class="page-header"><h1>Settings</h1><p class="page-subtitle">Data management and appearance</p></div>';

    html += '<div class="settings-card"><h3>Appearance</h3><p>Switch between light and dark theme. Your choice is remembered on this device.</p>';
    html += '<div class="settings-actions"><button class="btn btn-secondary" id="btnToggleThemeSettings">Toggle dark mode</button></div></div>';

    html += '<div class="settings-card"><h3>Storage mode</h3>';
    html += "<p>" + (Storage.isCloud()
      ? "Connected to shared cloud storage (Firestore). Changes sync live across everyone with access."
      : Auth.isEnabled() ? "Firebase is configured but you're not yet an approved user." : "Running in local mode — data is saved only in this browser's <code>localStorage</code>. Fill in <code>js/firebase-config.js</code> to enable shared cloud storage and Google sign-in (see README).") + "</p></div>";

    html += '<div class="settings-card"><h3>Import / Export data (Excel)</h3>';
    html += "<p>Download the template, fill it in (Excel, or Google Sheets — edit there, then <strong>File \u2192 Download \u2192 Microsoft Excel (.xlsx)</strong>), and upload it back here. One row per project on the <strong>Projects</strong> tab, one row per timeline entry on the <strong>Activities</strong> tab, linked by matching Client + Project Name.</p>";
    html += '<div class="settings-actions">';
    html += '<button class="btn btn-secondary" id="btnDownloadExcelTemplate2"' + (p2.download ? "" : " disabled") + '>Download Excel template</button>';
    html += '<button class="btn btn-primary" id="btnImportExcel2"' + (canBulkManage() ? "" : " disabled") + '>Import from Excel (.xlsx)</button>';
    html += "</div></div>";

    html += '<div class="settings-card"><h3>Advanced: JSON export / import</h3>';
    html += "<p>For backups, or scripting against the data directly. Most people should use the Excel option above instead.</p>";
    html += '<div class="settings-actions">';
    html += '<button class="btn btn-secondary" id="btnDownloadTemplate2"' + (p2.download ? "" : " disabled") + '>Download JSON template</button>';
    html += '<button class="btn btn-secondary" id="btnExport2"' + (p2.download ? "" : " disabled") + '>Export current data (JSON)</button>';
    html += '<button class="btn btn-secondary" id="btnImport2"' + (canBulkManage() ? "" : " disabled") + '>Import data (JSON)</button>';
    html += "</div></div>";

    html += '<div class="settings-card"><h3>Reset</h3>';
    html += '<div class="settings-actions">';
    html += '<button class="btn btn-secondary" id="btnResetSample2"' + (canBulkManage() ? "" : " disabled") + '>Reset to sample data</button>';
    html += '<button class="btn btn-danger" id="btnClearAll2"' + (canBulkManage() ? "" : " disabled") + '>Clear all data</button>';
    html += "</div></div>";

    if (perms().admin) {
      var dir = state.teamDirectory || Data.DEFAULT_TEAM_DIRECTORY;
      html += '<div class="settings-card"><h3>Team directory</h3>';
      html += "<p>Names offered in the Owner / Requested By dropdowns when logging activities. You can still type any other name (e.g. a client contact) freely — this list is just for your own team.</p>";
      html += '<div class="form-grid" style="padding:0;">';
      html += '<div class="form-field"><label>Delivery Team (one per line)</label><textarea id="teamDeliveryList" rows="6">' + esc((dir.delivery || []).join("\n")) + "</textarea></div>";
      html += '<div class="form-field"><label>Sales &amp; Pre-Sales Team (one per line)</label><textarea id="teamSalesList" rows="6">' + esc((dir.salesPresales || []).join("\n")) + "</textarea></div>";
      html += "</div>";
      html += '<div class="settings-actions"><button class="btn btn-primary" id="btnSaveTeamDirectory">Save team directory</button></div>';
      html += '<div id="teamDirStatus" style="margin-top:8px;font-size:12.5px;color:var(--ink-soft);"></div>';
      html += "</div>";
    }

    if (Storage.isCloud() && perms().admin) {
      var publicUrl = window.location.href.replace(/\/[^\/]*$/, "/public-dashboard.html");
      html += '<div class="settings-card"><h3>Public dashboard link</h3>';
      html += "<p>A read-only, no-login snapshot you can share with anyone — leadership, clients, whoever. It shows portfolio stats and each project's status/health only — no dependency notes, no activity history, no emails. Nothing updates live; click Publish whenever you want the link to reflect the latest data.</p>";
      html += '<div class="settings-actions"><button class="btn btn-primary" id="btnPublishSnapshot">Publish current data</button></div>';
      html += '<p style="margin-top:10px;font-size:12.5px;"><strong>Share this link:</strong><br><code id="publicDashboardUrl" style="word-break:break-all;">' + esc(publicUrl) + '</code> ' +
        '<button class="link-btn" id="btnCopyPublicUrl">Copy</button></p>';
      html += '<div id="publishStatus" style="margin-top:8px;font-size:12.5px;color:var(--ink-soft);"></div>';
      html += "</div>";
    }

    html += '<div class="settings-card"><h3>Definitions</h3><dl class="def-list">' +
      "<dt>Waiting</dt><dd>We requested something from a dependency owner and are waiting for it.</dd>" +
      "<dt>Blocked</dt><dd>Work cannot proceed even though a dependency was received — something is actively preventing progress.</dd>" +
      "<dt>Status</dt><dd>The project's current Kanban column (workflow stage).</dd>" +
      "<dt>Health</dt><dd>An independent risk signal: On Track, At Risk, Delayed, or Blocked.</dd>" +
      "</dl></div>";
    main.innerHTML = html;

    var saveTeamBtn = $("#btnSaveTeamDirectory");
    if (saveTeamBtn) {
      saveTeamBtn.addEventListener("click", function () {
        var newDir = {
          delivery: $("#teamDeliveryList").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean),
          salesPresales: $("#teamSalesList").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean)
        };
        saveTeamBtn.disabled = true;
        Storage.saveTeamDirectory(newDir).then(function () {
          state.teamDirectory = newDir;
          var status = $("#teamDirStatus");
          if (status) status.textContent = "Saved " + new Date().toLocaleString() + ".";
          if (saveTeamBtn) saveTeamBtn.disabled = false;
        });
      });
    }

    var publishBtn = $("#btnPublishSnapshot");
    if (publishBtn) {
      publishBtn.addEventListener("click", function () {
        publishBtn.disabled = true;
        Auth.publishPublicSnapshot(buildPublicSnapshot()).then(function () {
          var status = $("#publishStatus");
          if (status) status.textContent = "Published " + new Date().toLocaleString() + " — the link now shows this data.";
          if (publishBtn) publishBtn.disabled = false;
        }).catch(function (err) {
          var status = $("#publishStatus");
          if (status) status.textContent = "Publish failed: " + err.message;
          if (publishBtn) publishBtn.disabled = false;
        });
      });
      var copyBtn = $("#btnCopyPublicUrl");
      if (copyBtn) copyBtn.addEventListener("click", function () {
        var text = $("#publicDashboardUrl").textContent;
        if (navigator.clipboard) navigator.clipboard.writeText(text);
      });
    }

    $("#btnToggleThemeSettings").addEventListener("click", function () { $("#btnThemeToggle").click(); });
    $("#btnDownloadExcelTemplate2").addEventListener("click", function () { $("#btnDownloadExcelTemplate").click(); });
    $("#btnImportExcel2").addEventListener("click", function () { $("#btnImportExcel").click(); });
    $("#btnDownloadTemplate2").addEventListener("click", function () { $("#btnDownloadTemplate").click(); });
    $("#btnExport2").addEventListener("click", function () { $("#btnExport").click(); });
    $("#btnImport2").addEventListener("click", function () { $("#btnImport").click(); });
    $("#btnResetSample2").addEventListener("click", function () { $("#btnResetSample").click(); });
    $("#btnClearAll2").addEventListener("click", function () { $("#btnClearAll").click(); });
  }

  // ---------------------------------------------------------------- modal
  function openModal(innerHtml) { $("#modalContent").innerHTML = innerHtml; $("#modalBackdrop").classList.add("open"); }
  function closeModal() { $("#modalBackdrop").classList.remove("open"); $("#modalContent").innerHTML = ""; }

  // ---------------------------------------------------------------- drawer
  function openDrawer(innerHtml) { $("#drawerContent").innerHTML = innerHtml; $("#drawerBackdrop").classList.add("open"); }
  function closeDrawer() { $("#drawerBackdrop").classList.remove("open"); $("#drawerContent").innerHTML = ""; state.selectedProjectId = null; }

  function openProjectDrawer(id) {
    state.selectedProjectId = id;
    renderDrawer();
    closeModal();
    $("#drawerBackdrop").classList.add("open");
  }

  function renderDrawer() {
    var project = findProject(state.selectedProjectId);
    if (!project) { closeDrawer(); return; }
    var p2 = perms();
    var canDirect = canEditProject(project);
    var canPropose = isProposing();
    var a = Data.calcProjectAnalytics(project);
    var dep = Data.currentDependency(project);
    var statusLabel = (Data.STATUSES.filter(function (s) { return s.key === project.status; })[0] || {}).label || project.status;

    var html = '<div class="drawer-header">';
    html += '<button class="drawer-close" id="drawerCloseBtn">&times;</button>';
    html += '<div class="drawer-client">' + esc(project.client) + "</div>";
    html += '<div class="drawer-project">' + esc(project.projectName) + "</div>";
    html += '<div class="drawer-badges">';
    html += '<span class="badge ' + Kanban.typeBadgeClass(project.projectType) + '">' + project.projectType + "</span>";
    html += '<span class="pill pill-neutral">Status: ' + esc(statusLabel) + "</span>";
    html += '<span class="health-dot ' + Kanban.healthDotClass(project.health) + '"></span><span class="health-text">' + esc(project.health) + "</span>";
    html += '<span class="pill pill-neutral">Owner: ' + esc(ownerDisplay(project)) + "</span>";
    html += "</div>";
    html += '<div class="drawer-actions">';
    if (canDirect) {
      html += '<button class="btn btn-secondary btn-sm" id="btnEditProject">Edit project</button>';
      html += '<button class="btn btn-danger btn-sm" id="btnDeleteProject">Delete project</button>';
    } else if (canPropose) {
      html += '<button class="btn btn-secondary btn-sm" id="btnEditProject">Propose edit</button>';
      html += '<button class="btn btn-danger btn-sm" id="btnDeleteProject">Propose deletion</button>';
    }
    if (p2.download) html += '<button class="btn btn-secondary btn-sm" id="btnDownloadProjectReport">Download report</button>';
    html += "</div></div>";

    html += '<div class="drawer-body">';
    html += '<div class="drawer-section"><div class="drawer-section-title">Project Information</div><div class="info-grid">';
    html += infoRow("Client", project.client);
    html += infoRow("Project Type", project.projectType);
    html += infoRow("Environment", Kanban.envLabel(project));
    html += infoRow("Infrastructure Ownership", project.infrastructureOwnership);
    html += infoRow("Project Owner", ownerDisplay(project));
    html += infoRow("Owner Type", project.ownerType || "—");
    html += infoRow("Start Date", Data.formatDate(project.startDate));
    html += infoRow("Target Date", Data.formatDate(project.targetDate));
    html += infoRow("Status", statusLabel);
    html += infoRow("Health", project.health);
    html += "</div>";
    if (project.description) html += '<p class="drawer-desc">' + esc(project.description) + "</p>";
    html += "</div>";

    html += '<div class="drawer-section"><div class="drawer-section-title">Modules</div><div class="chip-row">' + Kanban.moduleChips(project.modules, 10) + "</div></div>";

    html += '<div class="drawer-section"><div class="drawer-section-title">Current Dependency</div>';
    if (dep) {
      var w = Data.calcWaiting(dep);
      html += '<div class="dependency-card">';
      html += infoRow("Dependency", dep.description);
      html += infoRow("Owner", dep.owner);
      html += infoRow("Owner Type", dep.dependencySide);
      html += infoRow("Requested", Data.formatDate(dep.requestedDate));
      html += infoRow("Expected", dep.expectedDate ? Data.formatDate(dep.expectedDate) : "—");
      html += infoRow("Received", dep.receivedDate ? Data.formatDate(dep.receivedDate) : "Not yet received");
      html += infoRow("Waiting", w.days + " day" + (w.days === 1 ? "" : "s"));
      if (dep.impact) html += infoRow("Impact", dep.impact);
      html += "</div>";
    } else {
      html += '<div class="empty-state">No outstanding dependency.</div>';
    }
    html += "</div>";

    html += '<div class="drawer-section"><div class="drawer-section-title">Waiting-Time Analytics</div><div class="mini-stats">';
    html += miniStat("Total elapsed", a.totalElapsed);
    html += miniStat("Active work", a.activeWork);
    html += miniStat("Client waiting", a.clientWaiting);
    html += miniStat("Internal waiting", a.internalWaiting);
    html += "</div></div>";

    html += '<div class="drawer-section"><div class="drawer-section-title-row"><div class="drawer-section-title">Project Timeline</div>' +
      ((canDirect || canPropose) ? '<button class="btn btn-primary btn-sm" id="btnAddActivity">' + (canDirect ? "+ Add Activity" : "+ Propose Activity") + '</button>' : "") + "</div>";
    html += Timeline.renderProjectTimeline(project, canDirect, canPropose);
    html += "</div>";

    html += '<div class="drawer-section"><div class="drawer-section-title">Activity Log</div><div class="audit-log">';
    if (!project.auditLog || !project.auditLog.length) {
      html += '<div class="empty-state">No log entries yet.</div>';
    } else {
      project.auditLog.forEach(function (l) { html += '<div class="audit-item"><span class="audit-date">' + Data.formatDate(l.date) + '</span><span class="audit-text">' + esc(l.text) + "</span></div>"; });
    }
    html += "</div></div></div>";

    openDrawer(html);
    attachDrawerEvents(project, p2, canDirect, canPropose);
  }

  function infoRow(label, value) { return '<div class="info-row"><span class="info-label">' + esc(label) + '</span><span class="info-value">' + esc(value || "—") + "</span></div>"; }
  function miniStat(label, value) { return '<div class="mini-stat"><div class="mini-stat-value">' + value + '</div><div class="mini-stat-label">' + esc(label) + "</div></div>"; }

  function attachDrawerEvents(project, p2, canDirect, canPropose) {
    $("#drawerCloseBtn").addEventListener("click", closeDrawer);
    if (canDirect || canPropose) {
      $("#btnEditProject").addEventListener("click", function () { openProjectForm(project.id); });
      $("#btnDeleteProject").addEventListener("click", function () { confirmDeleteProject(project.id, true); });
      var addActBtn = $("#btnAddActivity");
      if (addActBtn) addActBtn.addEventListener("click", function () { openActivityForm(project.id, null); });
      $all("[data-edit-activity]").forEach(function (btn) { btn.addEventListener("click", function () { openActivityForm(project.id, btn.getAttribute("data-edit-activity")); }); });
      $all("[data-delete-activity]").forEach(function (btn) { btn.addEventListener("click", function () { confirmDeleteActivity(project.id, btn.getAttribute("data-delete-activity")); }); });
    }
    if (p2.download) {
      var repBtn = $("#btnDownloadProjectReport");
      if (repBtn) repBtn.addEventListener("click", function () { Reports.projectReport(project); });
    }
  }

  // ---------------------------------------------------------------- project form (add/edit)
  function multiSelectHtml(name, options, selected) {
    selected = selected || [];
    return '<div class="multi-select" data-name="' + name + '">' + options.map(function (o) {
      var checked = selected.indexOf(o) !== -1 ? " checked" : "";
      return '<label class="ms-option"><input type="checkbox" value="' + esc(o) + '"' + checked + "> " + esc(o) + "</label>";
    }).join("") + "</div>";
  }
  function selectHtml(id, options, current, required) {
    return '<select id="' + id + '"' + (required ? " required" : "") + ">" + options.map(function (o) { return '<option value="' + esc(o) + '"' + (o === current ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>";
  }

  function openProjectForm(projectId) {
    var project = projectId ? findProject(projectId) : null;
    var isEdit = !!project;
    var s = Auth.isEnabled() ? Auth.state() : null;

    if (isEdit) {
      if (!canEditProject(project) && !isProposing()) return alert("You don't have edit access to this project.");
    } else {
      if (!perms().canAddProjects) return alert("You don't have permission to add projects.");
    }

    var proposing = isProposing(); // intern: this submission becomes a pending change, not a live write
    project = project || {
      client: "", projectName: "", projectType: "POC", environment: "SaaS", cloudProvider: "AWS",
      infrastructureOwnership: "IDfy", owner: "", ownerEmail: "", ownerType: "Project / PM", startDate: Data.todayStr(), targetDate: "",
      status: "backlog", health: "ON TRACK", modules: [], description: ""
    };

    // Who can this be owned by? Admin/intern get a picker; a member creating
    // their own project is auto-assigned to themselves (no picker shown); a
    // member editing already only reaches here if they own it, so no
    // reassignment UI either — only admin reassigns ownership.
    var showOwnerPicker = Auth.isEnabled() && s && (s.isAdmin || (proposing && !isEdit));

    function renderForm(ownerCandidates) {
      var html = '<div class="modal-header"><h2>' + (proposing ? (isEdit ? "Propose Edit — Project" : "Propose New Project") : (isEdit ? "Edit Project" : "Add Project")) + '</h2><button class="drawer-close" id="modalCloseBtn">&times;</button></div>';
      html += '<form id="projectForm" class="form-grid">';
      html += formField("Client Name", '<input type="text" id="f_client" value="' + esc(project.client) + '" required>');
      html += formField("Project Name", '<input type="text" id="f_projectName" value="' + esc(project.projectName) + '" required>');
      html += formField("Project Type", selectHtml("f_projectType", Data.PROJECT_TYPES, project.projectType, true));
      html += formField("Environment Type", selectHtml("f_environment", Data.ENV_TYPES, project.environment, true));
      html += formField("Cloud Provider", selectHtml("f_cloudProvider", Data.CLOUD_PROVIDERS, project.cloudProvider || "AWS"), "f_cloudProviderRow");
      html += formField("Infrastructure Ownership", selectHtml("f_infra", Data.INFRA_OWNERSHIP, project.infrastructureOwnership, true));

      if (showOwnerPicker) {
        var options = ownerCandidates.map(function (u) { return '<option value="' + esc(u.email) + '" data-name="' + esc(u.displayName) + '"' + (u.email === project.ownerEmail ? " selected" : "") + ">" + esc(u.displayName) + " (" + esc(u.email) + ")</option>"; }).join("");
        html += formField(proposing ? "Assign to (who will review/own this)" : "Project Owner", '<select id="f_ownerEmail" required><option value="">— Select —</option>' + options + "</select>");
      } else if (isEdit) {
        html += formField("Project Owner", '<input type="text" value="' + esc(ownerDisplay(project)) + '" disabled>');
      } else {
        html += formField("Project Owner", '<input type="text" value="' + esc(s ? s.profile.displayName : "You") + '" disabled>');
      }
      html += formField("Owner Type", selectHtml("f_ownerType", Data.OWNER_TYPES, Data.fuzzyMatch(project.ownerType, Data.OWNER_TYPES) || project.ownerType || "Project / PM", true));

      html += formField("Start Date", '<input type="date" id="f_startDate" value="' + esc(project.startDate) + '" required>');
      html += formField("Target Date", '<input type="date" id="f_targetDate" value="' + esc(project.targetDate) + '">');
      html += formField("Status", selectHtml("f_status", Data.STATUSES.map(function (s2) { return s2.label; }), (Data.STATUSES.filter(function (s2) { return s2.key === project.status; })[0] || {}).label || "Backlog", true));
      html += formField("Health", selectHtml("f_health", Data.HEALTHS, project.health, true));
      html += formField("Privy Modules", multiSelectHtml("modules", Data.MODULES, project.modules), null, true);
      html += formField("Description", '<textarea id="f_description" rows="3">' + esc(project.description) + "</textarea>", null, true);
      if (proposing) html += '<div class="form-field form-field-full"><div class="empty-state">This will be submitted for approval — nothing changes live until an admin or the project owner approves it.</div></div>';
      html += '<div class="form-actions"><button type="button" class="btn btn-ghost" id="btnCancelProject">Cancel</button><button type="submit" class="btn btn-primary">' + (proposing ? "Submit for Approval" : "Save Project") + "</button></div>";
      html += "</form>";
      openModal(html);

      function toggleCloudRow() { var row = $("#f_cloudProviderRow"); if (row) row.style.display = $("#f_environment").value === "Cloud" ? "" : "none"; }
      $("#f_environment").addEventListener("change", toggleCloudRow);
      toggleCloudRow();
      $("#modalCloseBtn").addEventListener("click", closeModal);
      $("#btnCancelProject").addEventListener("click", closeModal);

      $("#projectForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var modules = $all('.multi-select[data-name="modules"] input:checked').map(function (i) { return i.value; });
        var statusLabel = $("#f_status").value;
        var statusKey = (Data.STATUSES.filter(function (s2) { return s2.label === statusLabel; })[0] || {}).key || "backlog";

        var ownerEmail, ownerName;
        if (showOwnerPicker) {
          var sel = $("#f_ownerEmail");
          var opt = sel.options[sel.selectedIndex];
          if (!sel.value) { alert("Please assign an owner."); return; }
          ownerEmail = sel.value;
          ownerName = opt ? opt.getAttribute("data-name") : sel.value;
        } else if (isEdit) {
          ownerEmail = project.ownerEmail; ownerName = project.owner;
        } else {
          ownerEmail = s ? s.email : ""; ownerName = s ? s.profile.displayName : "";
        }

        var payload = {
          client: $("#f_client").value.trim(), projectName: $("#f_projectName").value.trim(),
          projectType: $("#f_projectType").value, environment: $("#f_environment").value,
          cloudProvider: $("#f_environment").value === "Cloud" ? $("#f_cloudProvider").value : "",
          infrastructureOwnership: $("#f_infra").value, owner: ownerName, ownerEmail: ownerEmail,
          ownerType: $("#f_ownerType").value,
          startDate: $("#f_startDate").value, targetDate: $("#f_targetDate").value,
          status: statusKey, health: $("#f_health").value, modules: modules,
          description: $("#f_description").value.trim()
        };

        if (proposing) {
          Auth.submitPendingChange({
            type: isEdit ? "edit_project" : "create_project",
            targetProjectId: isEdit ? project.id : null,
            targetOwnerEmail: ownerEmail,
            clientLabel: payload.client + " — " + payload.projectName,
            payload: payload
          }).then(function () {
            closeModal();
            alert("Submitted for approval. " + ownerName + " (or an admin) will review it in Approvals.");
          }).catch(function (err) { alert("Couldn't submit: " + err.message); });
          return;
        }

        if (isEdit) {
          var oldStatus = project.status, oldHealth = project.health;
          Object.assign(project, payload);
          if (oldStatus !== project.status) {
            var oldLabel = (Data.STATUSES.filter(function (s2) { return s2.key === oldStatus; })[0] || {}).label || oldStatus;
            addAudit(project, "Status changed: " + oldLabel + " → " + statusLabel);
          }
          if (oldHealth !== project.health) addAudit(project, "Health changed: " + oldHealth + " → " + project.health);
          persistProject(project);
        } else {
          payload.id = Data.generateId("proj");
          payload.activities = [];
          payload.auditLog = [{ date: Data.todayStr(), text: "Project created" }];
          state.projects.push(payload);
          project = payload;
          persistProject(project);
        }

        closeModal();
        if (["dashboard", "kanban", "projects"].indexOf(state.page) !== -1) renderPage();
        if ($("#drawerBackdrop").classList.contains("open") && state.selectedProjectId === project.id) renderDrawer();
        if (!isEdit) navigate("kanban");
      });
    }

    if (showOwnerPicker) {
      Auth.listOwnerCandidates(renderForm);
    } else {
      renderForm([]);
    }
  }

  function formField(label, inputHtml, rowId, fullWidth) {
    return '<div class="form-field' + (fullWidth ? " form-field-full" : "") + '"' + (rowId ? ' id="' + rowId + '"' : "") + ">" + '<label>' + esc(label) + "</label>" + inputHtml + "</div>";
  }

  function confirmDeleteProject(id, andCloseDrawer) {
    var project = findProject(id);
    if (!project) return;
    var proposing = isProposing();
    if (!canEditProject(project) && !proposing) return alert("You don't have edit access to this project.");

    if (proposing) {
      if (!confirm('Propose deleting "' + project.client + " — " + project.projectName + '"? This will be sent for approval.')) return;
      Auth.submitPendingChange({
        type: "delete_project",
        targetProjectId: project.id,
        targetOwnerEmail: project.ownerEmail || null,
        clientLabel: project.client + " — " + project.projectName,
        payload: {}
      }).then(function () {
        if (andCloseDrawer) closeDrawer();
        alert("Deletion proposed — awaiting approval.");
      });
      return;
    }

    if (!confirm('Delete "' + project.client + " — " + project.projectName + '"? This will also delete its activity history. This cannot be undone.')) return;
    state.projects = state.projects.filter(function (p) { return p.id !== id; });
    persistDelete(id);
    if (andCloseDrawer) closeDrawer();
    renderPage();
  }

  // ---------------------------------------------------------------- activity form (add/edit)
  function openActivityForm(projectId, activityId) {
    var project = findProject(projectId);
    if (!project) return;
    var proposing = isProposing();
    if (!canEditProject(project) && !proposing) return alert("You don't have edit access to this project.");

    var activity = activityId ? (project.activities || []).filter(function (a) { return a.id === activityId; })[0] : null;
    var isEdit = !!activity;
    activity = activity || {
      date: Data.todayStr(), activityType: "STATUS UPDATE", description: "", ownerType: "INTERNAL TECH TEAM",
      owner: "", dependencySide: "Internal", requestedBy: "", requestedDate: "", expectedDate: "", receivedDate: "",
      status: "OPEN", impact: "", relatedPhase: "", notes: ""
    };

    var html = '<div class="modal-header"><h2>' + (proposing ? (isEdit ? "Propose Edit — Activity" : "Propose Activity") : (isEdit ? "Edit Activity" : "Add Activity")) + '</h2><button class="drawer-close" id="modalCloseBtn">&times;</button></div>';
    html += '<form id="activityForm" class="form-grid">';
    html += formField("Activity Date", '<input type="date" id="a_date" value="' + esc(activity.date) + '" required>');
    html += formField("Activity Type", selectHtml("a_type", Data.ACTIVITY_TYPES, activity.activityType, true));
    html += formField("Description", '<input type="text" id="a_description" value="' + esc(activity.description) + '" required>', null, true);
    html += formField("Owner Type", selectHtml("a_ownerType", Data.OWNER_TYPES, Data.fuzzyMatch(activity.ownerType, Data.OWNER_TYPES) || activity.ownerType, true));
    html += formField("Owner", '<input type="text" id="a_owner" list="teamNamesList" value="' + esc(activity.owner) + '" placeholder="Pick from team, or type a client contact">');
    html += formField("Dependency Side", selectHtml("a_side", Data.DEPENDENCY_SIDES, activity.dependencySide, true));
    html += formField("Requested By", '<input type="text" id="a_requestedBy" list="teamNamesList" value="' + esc(activity.requestedBy) + '">');
    html += formField("Requested Date", '<input type="date" id="a_requestedDate" value="' + esc(activity.requestedDate) + '">');
    html += formField("Expected Date", '<input type="date" id="a_expectedDate" value="' + esc(activity.expectedDate) + '">');
    html += formField("Received Date", '<input type="date" id="a_receivedDate" value="' + esc(activity.receivedDate) + '">');
    html += formField("Status", selectHtml("a_status", Data.ACTIVITY_STATUSES, activity.status, true));
    html += formField("Impact", '<input type="text" id="a_impact" list="impactSuggestionsList" value="' + esc(activity.impact) + '">', null, true);
    html += formField("Related Phase", '<input type="text" id="a_phase" list="implementationPhasesList" value="' + esc(activity.relatedPhase) + '">');
    html += formField("Notes", '<textarea id="a_notes" rows="2">' + esc(activity.notes) + "</textarea>", null, true);
    html += '<datalist id="teamNamesList">' + teamDirectoryNames().map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>";
    html += '<datalist id="impactSuggestionsList">' + Data.IMPACT_SUGGESTIONS.map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>";
    html += '<datalist id="implementationPhasesList">' + Data.IMPLEMENTATION_PHASES.map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>";
    if (proposing) html += '<div class="form-field form-field-full"><div class="empty-state">This will be submitted for approval — nothing changes live until an admin or the project owner approves it.</div></div>';
    html += '<div class="form-actions"><button type="button" class="btn btn-ghost" id="btnCancelActivity">Cancel</button><button type="submit" class="btn btn-primary">' + (proposing ? "Submit for Approval" : "Save Activity") + "</button></div>";
    html += "</form>";
    openModal(html);
    $("#modalCloseBtn").addEventListener("click", closeModal);
    $("#btnCancelActivity").addEventListener("click", closeModal);

    $("#activityForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var payload = {
        date: $("#a_date").value, activityType: $("#a_type").value, description: $("#a_description").value.trim(),
        ownerType: $("#a_ownerType").value, owner: $("#a_owner").value.trim(), dependencySide: $("#a_side").value,
        requestedBy: $("#a_requestedBy").value.trim(), requestedDate: $("#a_requestedDate").value,
        expectedDate: $("#a_expectedDate").value, receivedDate: $("#a_receivedDate").value,
        status: $("#a_status").value, impact: $("#a_impact").value.trim(),
        relatedPhase: $("#a_phase").value.trim(), notes: $("#a_notes").value.trim()
      };

      if (proposing) {
        if (isEdit) payload.activityId = activity.id;
        Auth.submitPendingChange({
          type: isEdit ? "edit_activity" : "add_activity",
          targetProjectId: project.id,
          targetOwnerEmail: project.ownerEmail || null,
          clientLabel: project.client + " — " + project.projectName,
          payload: payload
        }).then(function () {
          closeModal();
          alert("Submitted for approval.");
        }).catch(function (err) { alert("Couldn't submit: " + err.message); });
        return;
      }

      project.activities = project.activities || [];
      if (isEdit) { Object.assign(activity, payload); addAudit(project, "Activity updated: " + payload.description); }
      else { payload.id = Data.generateId("act"); project.activities.push(payload); addAudit(project, "Activity added: " + payload.description); }
      persistProject(project);
      closeModal();
      renderDrawer();
      if (["timeline", "analytics", "dashboard", "reports"].indexOf(state.page) !== -1) renderPage();
    });
  }

  function confirmDeleteActivity(projectId, activityId) {
    var project = findProject(projectId);
    if (!project) return;
    var proposing = isProposing();
    if (!canEditProject(project) && !proposing) return alert("You don't have edit access to this project.");
    var activity = (project.activities || []).filter(function (a) { return a.id === activityId; })[0];
    if (!activity) return;

    if (proposing) {
      if (!confirm('Propose deleting activity "' + activity.description + '"? This will be sent for approval.')) return;
      Auth.submitPendingChange({
        type: "delete_activity",
        targetProjectId: project.id,
        targetOwnerEmail: project.ownerEmail || null,
        clientLabel: project.client + " — " + project.projectName,
        payload: { activityId: activityId, description: activity.description }
      }).then(function () { alert("Deletion proposed — awaiting approval."); });
      return;
    }

    if (!confirm('Delete activity "' + activity.description + '"? This cannot be undone.')) return;
    project.activities = project.activities.filter(function (a) { return a.id !== activityId; });
    addAudit(project, "Activity deleted: " + activity.description);
    persistProject(project);
    renderDrawer();
  }

  // ---------------------------------------------------------------- public API
  return {
    boot: boot,
    esc: esc,
    navigate: navigate,
    openProjectDrawer: openProjectDrawer,
    updateProjectStatus: updateProjectStatus
  };
})();

document.addEventListener("DOMContentLoaded", function () { App.boot(); });
