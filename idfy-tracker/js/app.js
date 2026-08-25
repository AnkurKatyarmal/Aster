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
    globalTimelineFilters: {}
  };

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
    if (!Auth.isEnabled()) return { edit: true, download: true, admin: true };
    var s = Auth.state();
    return { edit: s.canEdit, download: s.canDownload, admin: s.isAdmin };
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
      if (!perms().edit) return alert("You have view-only access and can't add projects.");
      openProjectForm(null);
    });
    attachModalBackdrop();
    attachSettingsButtons();

    if (Auth.isEnabled()) {
      $("#sidebarFooter").textContent = "Connected to shared cloud storage";
      Auth.onChange(handleAuthState);
      Auth.onPendingCountChange(updatePendingBadge);
      Auth.init();
    } else {
      $("#sidebarFooter").textContent = "Data stored locally in this browser (local mode)";
      enterApp();
    }
  }

  function updatePendingBadge(count) {
    var badge = $("#pendingBadge");
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
    }

    attachSidebarNavOnce();
    attachGlobalSearchOnce();

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

  function attachSettingsButtons() {
    $("#btnExport").addEventListener("click", function () { Storage.exportJSON(state.projects); });
    $("#btnDownloadTemplate").addEventListener("click", function () { Storage.downloadTemplate(); });
    $("#btnImport").addEventListener("click", function () {
      if (!perms().edit) return alert("You have view-only access and can't import data.");
      $("#importFileInput").click();
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
    $("#btnResetSample").addEventListener("click", function () {
      if (!perms().admin && Auth.isEnabled()) return alert("Only an admin can reset to sample data.");
      if (confirm("Replace current data with fresh sample data? This cannot be undone.")) {
        replaceAllProjects(Data.sampleProjects());
      }
    });
    $("#btnClearAll").addEventListener("click", function () {
      if (!perms().admin && Auth.isEnabled()) return alert("Only an admin can clear all data.");
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
    if (state.page === "dashboard") return renderDashboard(main);
    if (state.page === "kanban") return renderKanbanPage(main);
    if (state.page === "projects") return renderProjectsPage(main);
    if (state.page === "timeline") return renderTimelinePage(main);
    if (state.page === "analytics") return renderAnalyticsPage(main);
    if (state.page === "reports") return renderReportsPage(main);
    if (state.page === "access") return renderAccessPage(main);
    if (state.page === "settings") return renderSettingsPage(main);
  }

  // ---------------------------------------------------------------- dashboard
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
    if (!projects.length) {
      html += '<div class="empty-state">No projects yet. ' + (perms().edit ? 'Use <strong>+ Add Project</strong>, or go to Settings to import data or load sample data.' : 'Ask an admin to add projects or approve your edit access.') + '</div>';
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
    Kanban.render($("#dashboardKanban"), projects.slice(0, 30), perms());
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
    html += filterBarHtml();
    html += '<div id="kanbanContainer"></div>';
    main.innerHTML = html;
    attachFilterBar(main);
    Kanban.render($("#kanbanContainer"), filteredProjects(), perms());
  }

  function updateProjectStatus(id, newStatus) {
    if (!perms().edit) { alert("You have view-only access and can't change project status."); renderPage(); return; }
    var project = findProject(id);
    if (!project || project.status === newStatus) return;
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
    html += "<thead><tr><th>Client</th><th>Project</th><th>Type</th><th>Environment</th><th>Modules</th><th>Status</th><th>Health</th><th>Waiting</th><th></th></tr></thead><tbody>";

    var projects = filteredProjects();
    var p2 = perms();
    if (!projects.length) {
      html += '<tr><td colspan="9" class="empty-cell">No projects match the current filters.</td></tr>';
    } else {
      projects.forEach(function (p) {
        var a = Data.calcProjectAnalytics(p);
        var statusLabel = (Data.STATUSES.filter(function (s) { return s.key === p.status; })[0] || {}).label || p.status;
        html += "<tr>";
        html += "<td>" + esc(p.client) + "</td>";
        html += '<td><a href="#" class="row-link" data-open-project="' + p.id + '">' + esc(p.projectName) + "</a></td>";
        html += '<td><span class="badge ' + Kanban.typeBadgeClass(p.projectType) + '">' + p.projectType + "</span></td>";
        html += "<td>" + esc(Kanban.envLabel(p)) + "</td>";
        html += '<td><div class="chip-row">' + Kanban.moduleChips(p.modules) + "</div></td>";
        html += "<td>" + esc(statusLabel) + "</td>";
        html += '<td><span class="health-dot ' + Kanban.healthDotClass(p.health) + '"></span> ' + esc(p.health) + "</td>";
        html += "<td>" + (a.totalWaiting > 0 ? a.totalWaiting + "d" : "—") + "</td>";
        html += "<td>" + (p2.edit ? '<button class="link-btn link-danger" data-delete-project="' + p.id + '">Delete</button>' : "") + "</td>";
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

    var todayStr = Data.todayStr();
    var weekAgo = new Date(Data.parseDate(todayStr).getTime() - 6 * 86400000).toISOString().slice(0, 10);
    html += '<div class="settings-card"><h3>Weekly Status Update</h3><p>Portfolio-wide status summary and all activity logged within a date range, across every project.</p>';
    html += '<div class="settings-actions">';
    html += '<input type="date" id="weeklyFrom" value="' + weekAgo + '"> <input type="date" id="weeklyTo" value="' + todayStr + '">';
    html += '<button class="btn btn-primary" id="btnGenWeeklyReport">Generate Weekly Report</button>';
    html += "</div></div>";

    main.innerHTML = html;

    if (!state.projects.length) return;
    $("#btnGenProjectReport").addEventListener("click", function () {
      var project = findProject($("#reportProjectSelect").value);
      if (project) Reports.projectReport(project);
    });
    $("#btnGenWeeklyReport").addEventListener("click", function () {
      Reports.weeklyReport(state.projects, $("#weeklyFrom").value, $("#weeklyTo").value);
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
    html += '<div id="pendingSection"></div><div class="section-title">All Users</div><div id="allUsersSection"></div>';
    main.innerHTML = html;

    Auth.listPending(function (rows) {
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
      var h = '<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Role</th><th></th></tr></thead><tbody>';
      rows.forEach(function (u) {
        h += "<tr><td>" + esc(u.displayName) + "</td><td>" + esc(u.email) + "</td><td>" + esc(u.status) + "</td>";
        h += "<td>" + (u.role === "admin" ? "Admin" :
          '<select data-change-role="' + u.uid + '">' +
          Auth.ROLES.filter(function (r) { return r !== "admin"; }).map(function (r) { return '<option value="' + r + '"' + (r === u.role ? " selected" : "") + '>' + Auth.ROLE_LABELS[r] + "</option>"; }).join("") +
          "</select>") + "</td>";
        h += "<td>" + (u.status === "approved" && u.role !== "admin" ? '<button class="link-btn link-danger" data-revoke="' + u.uid + '">Revoke</button>' : "") + "</td></tr>";
      });
      h += "</tbody></table></div>";
      el.innerHTML = h;
      $all("[data-change-role]", el).forEach(function (sel) {
        sel.addEventListener("change", function () { Auth.changeRole(sel.getAttribute("data-change-role"), sel.value); });
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
  function renderSettingsPage(main) {
    var p2 = perms();
    var html = '<div class="page-header"><h1>Settings</h1><p class="page-subtitle">Data management and appearance</p></div>';

    html += '<div class="settings-card"><h3>Appearance</h3><p>Switch between light and dark theme. Your choice is remembered on this device.</p>';
    html += '<div class="settings-actions"><button class="btn btn-secondary" id="btnToggleThemeSettings">Toggle dark mode</button></div></div>';

    html += '<div class="settings-card"><h3>Storage mode</h3>';
    html += "<p>" + (Storage.isCloud()
      ? "Connected to shared cloud storage (Firestore). Changes sync live across everyone with access."
      : Auth.isEnabled() ? "Firebase is configured but you're not yet an approved user." : "Running in local mode — data is saved only in this browser's <code>localStorage</code>. Fill in <code>js/firebase-config.js</code> to enable shared cloud storage and Google sign-in (see README).") + "</p></div>";

    html += '<div class="settings-card"><h3>Import / Export data</h3>';
    html += "<p>Import expects a JSON array of project objects. Download the template below to see the exact structure, including the activity/timeline fields.</p>";
    html += '<div class="settings-actions">';
    html += '<button class="btn btn-secondary" id="btnDownloadTemplate2"' + (p2.download ? "" : " disabled") + '>Download import template</button>';
    html += '<button class="btn btn-secondary" id="btnExport2"' + (p2.download ? "" : " disabled") + '>Export current data (JSON)</button>';
    html += '<button class="btn btn-secondary" id="btnImport2"' + (p2.edit ? "" : " disabled") + '>Import data (JSON)</button>';
    html += "</div></div>";

    html += '<div class="settings-card"><h3>Reset</h3>';
    html += '<div class="settings-actions">';
    html += '<button class="btn btn-secondary" id="btnResetSample2"' + (p2.edit ? "" : " disabled") + '>Reset to sample data</button>';
    html += '<button class="btn btn-danger" id="btnClearAll2"' + (p2.edit ? "" : " disabled") + '>Clear all data</button>';
    html += "</div></div>";

    html += '<div class="settings-card"><h3>Definitions</h3><dl class="def-list">' +
      "<dt>Waiting</dt><dd>We requested something from a dependency owner and are waiting for it.</dd>" +
      "<dt>Blocked</dt><dd>Work cannot proceed even though a dependency was received — something is actively preventing progress.</dd>" +
      "<dt>Status</dt><dd>The project's current Kanban column (workflow stage).</dd>" +
      "<dt>Health</dt><dd>An independent risk signal: On Track, At Risk, Delayed, or Blocked.</dd>" +
      "</dl></div>";
    main.innerHTML = html;

    $("#btnToggleThemeSettings").addEventListener("click", function () { $("#btnThemeToggle").click(); });
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
    html += "</div>";
    html += '<div class="drawer-actions">';
    if (p2.edit) {
      html += '<button class="btn btn-secondary btn-sm" id="btnEditProject">Edit project</button>';
      html += '<button class="btn btn-danger btn-sm" id="btnDeleteProject">Delete project</button>';
    }
    if (p2.download) html += '<button class="btn btn-secondary btn-sm" id="btnDownloadProjectReport">Download report</button>';
    html += "</div></div>";

    html += '<div class="drawer-body">';
    html += '<div class="drawer-section"><div class="drawer-section-title">Project Information</div><div class="info-grid">';
    html += infoRow("Client", project.client);
    html += infoRow("Project Type", project.projectType);
    html += infoRow("Environment", Kanban.envLabel(project));
    html += infoRow("Infrastructure Ownership", project.infrastructureOwnership);
    html += infoRow("Project Owner", project.owner);
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
      (p2.edit ? '<button class="btn btn-primary btn-sm" id="btnAddActivity">+ Add Activity</button>' : "") + "</div>";
    html += Timeline.renderProjectTimeline(project);
    html += "</div>";

    html += '<div class="drawer-section"><div class="drawer-section-title">Activity Log</div><div class="audit-log">';
    if (!project.auditLog || !project.auditLog.length) {
      html += '<div class="empty-state">No log entries yet.</div>';
    } else {
      project.auditLog.forEach(function (l) { html += '<div class="audit-item"><span class="audit-date">' + Data.formatDate(l.date) + '</span><span class="audit-text">' + esc(l.text) + "</span></div>"; });
    }
    html += "</div></div></div>";

    openDrawer(html);
    attachDrawerEvents(project, p2);
  }

  function infoRow(label, value) { return '<div class="info-row"><span class="info-label">' + esc(label) + '</span><span class="info-value">' + esc(value || "—") + "</span></div>"; }
  function miniStat(label, value) { return '<div class="mini-stat"><div class="mini-stat-value">' + value + '</div><div class="mini-stat-label">' + esc(label) + "</div></div>"; }

  function attachDrawerEvents(project, p2) {
    $("#drawerCloseBtn").addEventListener("click", closeDrawer);
    if (p2.edit) {
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
    if (!perms().edit) return alert("You have view-only access and can't add or edit projects.");
    var project = projectId ? findProject(projectId) : null;
    var isEdit = !!project;
    project = project || {
      client: "", projectName: "", projectType: "POC", environment: "SaaS", cloudProvider: "AWS",
      infrastructureOwnership: "IDfy", owner: "", startDate: Data.todayStr(), targetDate: "",
      status: "backlog", health: "ON TRACK", modules: [], description: ""
    };

    var html = '<div class="modal-header"><h2>' + (isEdit ? "Edit Project" : "Add Project") + '</h2><button class="drawer-close" id="modalCloseBtn">&times;</button></div>';
    html += '<form id="projectForm" class="form-grid">';
    html += formField("Client Name", '<input type="text" id="f_client" value="' + esc(project.client) + '" required>');
    html += formField("Project Name", '<input type="text" id="f_projectName" value="' + esc(project.projectName) + '" required>');
    html += formField("Project Type", selectHtml("f_projectType", Data.PROJECT_TYPES, project.projectType, true));
    html += formField("Environment Type", selectHtml("f_environment", Data.ENV_TYPES, project.environment, true));
    html += formField("Cloud Provider", selectHtml("f_cloudProvider", Data.CLOUD_PROVIDERS, project.cloudProvider || "AWS"), "f_cloudProviderRow");
    html += formField("Infrastructure Ownership", selectHtml("f_infra", Data.INFRA_OWNERSHIP, project.infrastructureOwnership, true));
    html += formField("Project Owner", '<input type="text" id="f_owner" value="' + esc(project.owner) + '" required>');
    html += formField("Start Date", '<input type="date" id="f_startDate" value="' + esc(project.startDate) + '" required>');
    html += formField("Target Date", '<input type="date" id="f_targetDate" value="' + esc(project.targetDate) + '">');
    html += formField("Status", selectHtml("f_status", Data.STATUSES.map(function (s) { return s.label; }), (Data.STATUSES.filter(function (s) { return s.key === project.status; })[0] || {}).label || "Backlog", true));
    html += formField("Health", selectHtml("f_health", Data.HEALTHS, project.health, true));
    html += formField("Privy Modules", multiSelectHtml("modules", Data.MODULES, project.modules), null, true);
    html += formField("Description", '<textarea id="f_description" rows="3">' + esc(project.description) + "</textarea>", null, true);
    html += '<div class="form-actions"><button type="button" class="btn btn-ghost" id="btnCancelProject">Cancel</button><button type="submit" class="btn btn-primary">Save Project</button></div>';
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
      var statusKey = (Data.STATUSES.filter(function (s) { return s.label === statusLabel; })[0] || {}).key || "backlog";

      var payload = {
        client: $("#f_client").value.trim(), projectName: $("#f_projectName").value.trim(),
        projectType: $("#f_projectType").value, environment: $("#f_environment").value,
        cloudProvider: $("#f_environment").value === "Cloud" ? $("#f_cloudProvider").value : "",
        infrastructureOwnership: $("#f_infra").value, owner: $("#f_owner").value.trim(),
        startDate: $("#f_startDate").value, targetDate: $("#f_targetDate").value,
        status: statusKey, health: $("#f_health").value, modules: modules,
        description: $("#f_description").value.trim()
      };

      if (isEdit) {
        var oldStatus = project.status, oldHealth = project.health;
        Object.assign(project, payload);
        if (oldStatus !== project.status) {
          var oldLabel = (Data.STATUSES.filter(function (s) { return s.key === oldStatus; })[0] || {}).label || oldStatus;
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

  function formField(label, inputHtml, rowId, fullWidth) {
    return '<div class="form-field' + (fullWidth ? " form-field-full" : "") + '"' + (rowId ? ' id="' + rowId + '"' : "") + ">" + '<label>' + esc(label) + "</label>" + inputHtml + "</div>";
  }

  function confirmDeleteProject(id, andCloseDrawer) {
    if (!perms().edit) return alert("You have view-only access and can't delete projects.");
    var project = findProject(id);
    if (!project) return;
    if (!confirm('Delete "' + project.client + " — " + project.projectName + '"? This will also delete its activity history. This cannot be undone.')) return;
    state.projects = state.projects.filter(function (p) { return p.id !== id; });
    persistDelete(id);
    if (andCloseDrawer) closeDrawer();
    renderPage();
  }

  // ---------------------------------------------------------------- activity form (add/edit)
  function openActivityForm(projectId, activityId) {
    if (!perms().edit) return alert("You have view-only access and can't add or edit activities.");
    var project = findProject(projectId);
    if (!project) return;
    var activity = activityId ? (project.activities || []).filter(function (a) { return a.id === activityId; })[0] : null;
    var isEdit = !!activity;
    activity = activity || {
      date: Data.todayStr(), activityType: "STATUS UPDATE", description: "", ownerType: "INTERNAL TECH TEAM",
      owner: "", dependencySide: "Internal", requestedBy: "", requestedDate: "", expectedDate: "", receivedDate: "",
      status: "OPEN", impact: "", relatedPhase: "", notes: ""
    };

    var html = '<div class="modal-header"><h2>' + (isEdit ? "Edit Activity" : "Add Activity") + '</h2><button class="drawer-close" id="modalCloseBtn">&times;</button></div>';
    html += '<form id="activityForm" class="form-grid">';
    html += formField("Activity Date", '<input type="date" id="a_date" value="' + esc(activity.date) + '" required>');
    html += formField("Activity Type", selectHtml("a_type", Data.ACTIVITY_TYPES, activity.activityType, true));
    html += formField("Description", '<input type="text" id="a_description" value="' + esc(activity.description) + '" required>', null, true);
    html += formField("Owner Type", selectHtml("a_ownerType", Data.OWNER_TYPES, activity.ownerType, true));
    html += formField("Owner", '<input type="text" id="a_owner" value="' + esc(activity.owner) + '" placeholder="e.g. HSBC DevOps">');
    html += formField("Dependency Side", selectHtml("a_side", Data.DEPENDENCY_SIDES, activity.dependencySide, true));
    html += formField("Requested By", '<input type="text" id="a_requestedBy" value="' + esc(activity.requestedBy) + '">');
    html += formField("Requested Date", '<input type="date" id="a_requestedDate" value="' + esc(activity.requestedDate) + '">');
    html += formField("Expected Date", '<input type="date" id="a_expectedDate" value="' + esc(activity.expectedDate) + '">');
    html += formField("Received Date", '<input type="date" id="a_receivedDate" value="' + esc(activity.receivedDate) + '">');
    html += formField("Status", selectHtml("a_status", Data.ACTIVITY_STATUSES, activity.status, true));
    html += formField("Impact", '<input type="text" id="a_impact" value="' + esc(activity.impact) + '">', null, true);
    html += formField("Related Phase", '<input type="text" id="a_phase" value="' + esc(activity.relatedPhase) + '">');
    html += formField("Notes", '<textarea id="a_notes" rows="2">' + esc(activity.notes) + "</textarea>", null, true);
    html += '<div class="form-actions"><button type="button" class="btn btn-ghost" id="btnCancelActivity">Cancel</button><button type="submit" class="btn btn-primary">Save Activity</button></div>';
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
    if (!perms().edit) return alert("You have view-only access and can't delete activities.");
    var project = findProject(projectId);
    if (!project) return;
    var activity = (project.activities || []).filter(function (a) { return a.id === activityId; })[0];
    if (!activity) return;
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
