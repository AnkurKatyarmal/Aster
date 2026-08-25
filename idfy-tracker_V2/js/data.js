/* ==========================================================================
   IDfy Project Tracker — data.js
   Constants, date helpers, waiting/analytics calculations, sample data.
   ========================================================================== */

var Data = (function () {
  "use strict";

  var TODAY = new Date("2026-08-14T00:00:00");

  var PROJECT_TYPES = ["POC", "LIVE"];

  var STATUSES = [
    { key: "backlog", label: "Backlog" },
    { key: "planned", label: "Planned" },
    { key: "in-progress", label: "In Progress" },
    { key: "blocked", label: "Blocked" },
    { key: "uat", label: "UAT" },
    { key: "completed", label: "Completed" }
  ];

  var HEALTHS = ["ON TRACK", "AT RISK", "DELAYED", "BLOCKED"];

  var ENV_TYPES = ["SaaS", "Cloud", "On-Prem"];
  var CLOUD_PROVIDERS = ["AWS", "Azure", "GCP", "Other"];
  var INFRA_OWNERSHIP = ["IDfy", "Client", "Shared"];

  var MODULES = [
    "CGP",
    "DPRM",
    "Cookie Manager",
    "Data Compass",
    "DPIA",
    "Breach Management",
    "TPRM",
    "Other"
  ];

  var ACTIVITY_TYPES = [
    "DISCUSSION",
    "ACTION",
    "REQUEST",
    "INFORMATION RECEIVED",
    "DELIVERABLE",
    "DECISION",
    "DEPENDENCY",
    "BLOCKER",
    "MEETING",
    "DEPLOYMENT",
    "TESTING",
    "UAT",
    "PRODUCTION",
    "STATUS UPDATE"
  ];

  var OWNER_TYPES = [
    "CLIENT",
    "INTERNAL TECH TEAM",
    "PROJECT / PM",
    "SECURITY",
    "DEVOPS",
    "PRODUCT",
    "OTHER"
  ];

  var DEPENDENCY_SIDES = ["Client", "Internal", "Other"];

  var ACTIVITY_STATUSES = [
    "OPEN",
    "WAITING",
    "PARTIALLY RECEIVED",
    "RECEIVED",
    "COMPLETED",
    "BLOCKED",
    "CANCELLED"
  ];

  // -- id generation ---------------------------------------------------
  var counter = 0;
  function generateId(prefix) {
    counter += 1;
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + counter.toString(36);
  }

  // -- date helpers ------------------------------------------------------
  function parseDate(str) {
    if (!str) return null;
    var d = new Date(str + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDate(str) {
    var d = parseDate(str);
    if (!d) return "—";
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
  }

  function todayStr() {
    return TODAY.toISOString().slice(0, 10);
  }

  function daysBetween(a, b) {
    var da = parseDate(a);
    var db = parseDate(b);
    if (!da || !db) return 0;
    return Math.round((db.getTime() - da.getTime()) / 86400000);
  }

  function daysFromToday(str) {
    var d = parseDate(str);
    if (!d) return 0;
    return Math.round((TODAY.getTime() - d.getTime()) / 86400000);
  }

  // -- waiting calculation for a single activity --------------------------
  // Returns { isWaiting, days, resolved }
  function calcWaiting(activity) {
    if (!activity.requestedDate) return { isWaiting: false, days: 0, resolved: false };
    var reqD = parseDate(activity.requestedDate);
    if (!reqD) return { isWaiting: false, days: 0, resolved: false };

    if (activity.receivedDate) {
      var days = daysBetween(activity.requestedDate, activity.receivedDate);
      return { isWaiting: false, days: Math.max(days, 0), resolved: true };
    }

    // No received date yet — only count if requested date is not in the future
    if (reqD.getTime() > TODAY.getTime()) {
      return { isWaiting: false, days: 0, resolved: false };
    }
    var openStatuses = ["OPEN", "WAITING", "PARTIALLY RECEIVED", "BLOCKED"];
    var stillOpen = openStatuses.indexOf(activity.status) !== -1;
    var days2 = daysFromToday(activity.requestedDate);
    return { isWaiting: stillOpen, days: Math.max(days2, 0), resolved: !stillOpen };
  }

  function dependencySideBucket(side) {
    if (side === "Client") return "client";
    if (side === "Internal") return "internal";
    return "other";
  }

  // -- project-level analytics ---------------------------------------------
  function calcProjectAnalytics(project) {
    var start = project.startDate;
    var end = project.status === "completed" && project.targetDate ? project.targetDate : todayStr();
    var totalElapsed = Math.max(daysBetween(start, end), 0);

    var clientWaiting = 0, internalWaiting = 0, otherWaiting = 0, blockedDays = 0;

    (project.activities || []).forEach(function (a) {
      var w = calcWaiting(a);
      if (w.days > 0) {
        var bucket = dependencySideBucket(a.dependencySide);
        if (bucket === "client") clientWaiting += w.days;
        else if (bucket === "internal") internalWaiting += w.days;
        else otherWaiting += w.days;
      }
      if (a.status === "BLOCKED") {
        blockedDays += Math.max(daysFromToday(a.date), 0) > 0 && !a.receivedDate ? 1 : 0;
      }
    });

    var totalWaiting = clientWaiting + internalWaiting + otherWaiting;
    var activeWork = Math.max(totalElapsed - totalWaiting, 0);

    return {
      totalElapsed: totalElapsed,
      activeWork: activeWork,
      clientWaiting: clientWaiting,
      internalWaiting: internalWaiting,
      otherWaiting: otherWaiting,
      totalWaiting: totalWaiting,
      blockedDays: blockedDays
    };
  }

  // Find the current outstanding dependency (most recent unresolved request)
  function currentDependency(project) {
    var open = (project.activities || []).filter(function (a) {
      var w = calcWaiting(a);
      return w.isWaiting;
    });
    if (!open.length) return null;
    open.sort(function (a, b) { return (a.requestedDate || "").localeCompare(b.requestedDate || ""); });
    return open[open.length - 1];
  }

  // Progress estimate purely for a compact visual: based on status weight
  var STATUS_PROGRESS = {
    backlog: 5,
    planned: 20,
    "in-progress": 55,
    blocked: 55,
    uat: 80,
    completed: 100
  };
  function progressFor(project) {
    return STATUS_PROGRESS[project.status] != null ? STATUS_PROGRESS[project.status] : 10;
  }

  // -- sample seed data ------------------------------------------------
  function sampleProjects() {
    function act(o) {
      return Object.assign({
        id: generateId("act"),
        activityType: "STATUS UPDATE",
        ownerType: "INTERNAL TECH TEAM",
        owner: "IDfy",
        dependencySide: "Internal",
        requestedBy: "",
        requestedDate: "",
        expectedDate: "",
        receivedDate: "",
        status: "COMPLETED",
        impact: "",
        relatedPhase: "",
        notes: ""
      }, o);
    }

    var projects = [];

    // 1. HSBC — rich timeline, matches spec example almost verbatim
    projects.push({
      id: generateId("proj"),
      client: "HSBC",
      projectName: "Privy Implementation",
      projectType: "LIVE",
      environment: "Cloud",
      cloudProvider: "GCP",
      infrastructureOwnership: "Client",
      owner: "Ankur",
      startDate: "2026-06-10",
      targetDate: "2026-08-25",
      status: "blocked",
      health: "AT RISK",
      modules: ["CGP", "DPRM", "Cookie Manager"],
      description: "Consent Governance Platform, DPRM and Cookie Manager rollout on HSBC-owned GCP infrastructure.",
      activities: [
        act({ date: "2026-06-15", activityType: "DELIVERABLE", description: "Docker Hub invitation accepted", ownerType: "CLIENT", owner: "HSBC IT", dependencySide: "Client", status: "RECEIVED", relatedPhase: "Prerequisites" }),
        act({ date: "2026-06-15", activityType: "DELIVERABLE", description: "Consent form shared", ownerType: "CLIENT", owner: "HSBC DPO", dependencySide: "Client", status: "COMPLETED", relatedPhase: "Prerequisites", notes: "Prerequisites completed" }),
        act({ date: "2026-06-25", activityType: "DELIVERABLE", description: "UAT SaaS API credentials shared", ownerType: "INTERNAL TECH TEAM", owner: "IDfy", dependencySide: "Internal", status: "COMPLETED", relatedPhase: "UAT Setup", notes: "Dependency: HSBC DevOps for validation" }),
        act({ date: "2026-06-29", activityType: "ACTION", description: "Production image preparation started", ownerType: "INTERNAL TECH TEAM", owner: "IDfy Engineering", dependencySide: "Internal", status: "COMPLETED", relatedPhase: "Build" }),
        act({ date: "2026-06-29", activityType: "DISCUSSION", description: "G3 CD pipeline configuration discussed", ownerType: "DEVOPS", owner: "HSBC DevOps", dependencySide: "Client", status: "COMPLETED", relatedPhase: "Deployment Planning", impact: "Finalize deployment architecture" }),
        act({ date: "2026-07-09", activityType: "DELIVERABLE", description: "VAPT report shared", ownerType: "SECURITY", owner: "IDfy Security", dependencySide: "Internal", status: "COMPLETED", relatedPhase: "Security Review", notes: "Dependency: HSBC security review" }),
        act({ date: "2026-08-12", activityType: "DEPLOYMENT", description: "Infrastructure deployment started", ownerType: "DEVOPS", owner: "HSBC DevOps", dependencySide: "Client", requestedBy: "IDfy", requestedDate: "2026-08-12", expectedDate: "2026-08-13", receivedDate: "", status: "WAITING", relatedPhase: "Deployment", impact: "Deployment delayed" }),
        act({ date: "2026-08-14", activityType: "REQUEST", description: "API encryption confirmation requested", ownerType: "DEVOPS", owner: "HSBC DevOps", dependencySide: "Client", requestedBy: "IDfy", requestedDate: "2026-08-14", expectedDate: "2026-08-15", receivedDate: "", status: "WAITING", relatedPhase: "Deployment" })
      ],
      auditLog: [
        { date: "2026-08-14", text: "Status changed: In Progress → Blocked" },
        { date: "2026-08-14", text: "Dependency added: HSBC DevOps — API encryption confirmation" },
        { date: "2026-08-12", text: "Status changed: Planned → In Progress" }
      ]
    });

    // 2. Punjab & Sind Bank — POC, rich timeline
    projects.push({
      id: generateId("proj"),
      client: "Punjab & Sind Bank",
      projectName: "Digital Apna Vahan — CMS Integration",
      projectType: "POC",
      environment: "SaaS",
      cloudProvider: "",
      infrastructureOwnership: "IDfy",
      owner: "Ankur",
      startDate: "2026-07-01",
      targetDate: "2026-08-30",
      status: "uat",
      health: "ON TRACK",
      modules: ["CGP", "DPRM"],
      description: "Vehicle loan journey consent capture via iFrame-embedded Privy CMS, webhook-driven confirmation.",
      activities: [
        act({ date: "2026-07-01", activityType: "MEETING", description: "Kickoff call — journey mapping for Digital Apna Vahan", ownerType: "PROJECT / PM", owner: "Ankur", dependencySide: "Internal", status: "COMPLETED" }),
        act({ date: "2026-07-08", activityType: "DELIVERABLE", description: "FSD V1 shared with PSB IT team", ownerType: "INTERNAL TECH TEAM", owner: "IDfy", dependencySide: "Internal", status: "COMPLETED" }),
        act({ date: "2026-07-15", activityType: "REQUEST", description: "Requested confirmation on consent-before-OTP sequencing", ownerType: "CLIENT", owner: "PSB IT", dependencySide: "Client", requestedBy: "IDfy", requestedDate: "2026-07-15", expectedDate: "2026-07-18", receivedDate: "2026-07-22", status: "RECEIVED" }),
        act({ date: "2026-07-24", activityType: "DECISION", description: "Removed postMessage/JS listener mechanism in favour of webhook confirmation", ownerType: "PROJECT / PM", owner: "Ankur", dependencySide: "Internal", status: "COMPLETED" }),
        act({ date: "2026-08-02", activityType: "DELIVERABLE", description: "FSD V4 and standalone iFrame integration guide delivered", ownerType: "INTERNAL TECH TEAM", owner: "IDfy", dependencySide: "Internal", status: "COMPLETED" }),
        act({ date: "2026-08-11", activityType: "UAT", description: "UAT environment access requested from PSB", ownerType: "CLIENT", owner: "PSB DevOps", dependencySide: "Client", requestedBy: "IDfy", requestedDate: "2026-08-11", expectedDate: "2026-08-13", receivedDate: "2026-08-13", status: "RECEIVED" }),
        act({ date: "2026-08-13", activityType: "UAT", description: "UAT execution started on webhook confirmation flow", ownerType: "INTERNAL TECH TEAM", owner: "IDfy", dependencySide: "Internal", status: "OPEN" })
      ],
      auditLog: [
        { date: "2026-08-13", text: "Status changed: In Progress → UAT" },
        { date: "2026-08-02", text: "Activity added: FSD V4 delivered" }
      ]
    });

    // 3. Axis Bank — LIVE, delayed, rich timeline
    projects.push({
      id: generateId("proj"),
      client: "Axis Bank",
      projectName: "Data Compass Rollout",
      projectType: "LIVE",
      environment: "On-Prem",
      cloudProvider: "",
      infrastructureOwnership: "Client",
      owner: "Ankur",
      startDate: "2026-05-20",
      targetDate: "2026-08-05",
      status: "in-progress",
      health: "DELAYED",
      modules: ["Data Compass"],
      description: "Data discovery and classification rollout across Axis on-prem clusters.",
      activities: [
        act({ date: "2026-05-20", activityType: "MEETING", description: "Project kickoff and scoping", ownerType: "PROJECT / PM", owner: "Ankur", dependencySide: "Internal", status: "COMPLETED" }),
        act({ date: "2026-06-02", activityType: "REQUEST", description: "Requested cluster port access list from Axis network team", ownerType: "CLIENT", owner: "Axis Network Team", dependencySide: "Client", requestedBy: "IDfy", requestedDate: "2026-06-02", expectedDate: "2026-06-05", receivedDate: "2026-06-20", status: "RECEIVED", impact: "Delayed environment setup by 2 weeks" }),
        act({ date: "2026-06-22", activityType: "ACTION", description: "Cluster connectivity established", ownerType: "INTERNAL TECH TEAM", owner: "IDfy Engineering", dependencySide: "Internal", status: "COMPLETED" }),
        act({ date: "2026-07-05", activityType: "BLOCKER", description: "Firewall rules blocking classification scans", ownerType: "DEVOPS", owner: "Axis Infra", dependencySide: "Client", requestedBy: "IDfy", requestedDate: "2026-07-05", expectedDate: "2026-07-08", receivedDate: "", status: "BLOCKED", impact: "Classification jobs cannot run" }),
        act({ date: "2026-07-20", activityType: "DISCUSSION", description: "Escalation call with Axis IT leadership on firewall delay", ownerType: "PROJECT / PM", owner: "Ankur", dependencySide: "Internal", status: "COMPLETED" }),
        act({ date: "2026-08-01", activityType: "STATUS UPDATE", description: "Leadership briefing and delay timeline shared internally", ownerType: "PROJECT / PM", owner: "Ankur", dependencySide: "Internal", status: "COMPLETED" })
      ],
      auditLog: [
        { date: "2026-08-01", text: "Status changed: Blocked → In Progress" },
        { date: "2026-07-05", text: "Status changed: In Progress → Blocked" }
      ]
    });

    // 4. Nuvama — light activity
    projects.push({
      id: generateId("proj"),
      client: "Nuvama",
      projectName: "Consent Governance POC",
      projectType: "POC",
      environment: "Cloud",
      cloudProvider: "AWS",
      infrastructureOwnership: "Shared",
      owner: "Ankur",
      startDate: "2026-07-28",
      targetDate: "2026-09-10",
      status: "planned",
      health: "ON TRACK",
      modules: ["CGP"],
      description: "Initial CGP proof of concept for wealth management consent flows.",
      activities: [
        act({ date: "2026-07-28", activityType: "MEETING", description: "Discovery call with Nuvama compliance team", ownerType: "PROJECT / PM", owner: "Ankur", dependencySide: "Internal", status: "COMPLETED" }),
        act({ date: "2026-08-10", activityType: "REQUEST", description: "Sandbox AWS account details requested", ownerType: "CLIENT", owner: "Nuvama IT", dependencySide: "Client", requestedBy: "IDfy", requestedDate: "2026-08-10", expectedDate: "2026-08-17", receivedDate: "", status: "WAITING" })
      ],
      auditLog: [
        { date: "2026-07-28", text: "Project created" }
      ]
    });

    // 5. ICICI Lombard — completed
    projects.push({
      id: generateId("proj"),
      client: "ICICI Lombard",
      projectName: "Cookie Consent Manager",
      projectType: "LIVE",
      environment: "Cloud",
      cloudProvider: "Azure",
      infrastructureOwnership: "IDfy",
      owner: "Ankur",
      startDate: "2026-05-01",
      targetDate: "2026-07-15",
      status: "completed",
      health: "ON TRACK",
      modules: ["Cookie Manager"],
      description: "Cookie Consent Manager implementation across policy microsites.",
      activities: [
        act({ date: "2026-05-01", activityType: "MEETING", description: "Kickoff", ownerType: "PROJECT / PM", owner: "Ankur", dependencySide: "Internal", status: "COMPLETED" }),
        act({ date: "2026-06-10", activityType: "DEPLOYMENT", description: "Production deployment completed", ownerType: "INTERNAL TECH TEAM", owner: "IDfy Engineering", dependencySide: "Internal", status: "COMPLETED" }),
        act({ date: "2026-07-15", activityType: "PRODUCTION", description: "Go-live sign-off received", ownerType: "CLIENT", owner: "ICICI Lombard IT", dependencySide: "Client", requestedBy: "IDfy", requestedDate: "2026-07-10", expectedDate: "2026-07-12", receivedDate: "2026-07-15", status: "RECEIVED" })
      ],
      auditLog: [
        { date: "2026-07-15", text: "Status changed: UAT → Completed" }
      ]
    });

    // 6. Alkem — backlog, minimal
    projects.push({
      id: generateId("proj"),
      client: "Alkem Laboratories",
      projectName: "DPIA Assessment",
      projectType: "POC",
      environment: "SaaS",
      cloudProvider: "",
      infrastructureOwnership: "IDfy",
      owner: "Ankur",
      startDate: "2026-08-08",
      targetDate: "2026-09-30",
      status: "backlog",
      health: "ON TRACK",
      modules: ["DPIA"],
      description: "Data Protection Impact Assessment scoping for pharma distribution systems.",
      activities: [
        act({ date: "2026-08-08", activityType: "REQUEST", description: "Initial scoping questionnaire sent to Alkem", ownerType: "CLIENT", owner: "Alkem Compliance", dependencySide: "Client", requestedBy: "IDfy", requestedDate: "2026-08-08", expectedDate: "2026-08-18", receivedDate: "", status: "OPEN" })
      ],
      auditLog: [
        { date: "2026-08-08", text: "Project created" }
      ]
    });

    // 7. Adani — blocked
    projects.push({
      id: generateId("proj"),
      client: "Adani",
      projectName: "TPRM Integration",
      projectType: "POC",
      environment: "On-Prem",
      cloudProvider: "",
      infrastructureOwnership: "Client",
      owner: "Ankur",
      startDate: "2026-06-15",
      targetDate: "2026-08-20",
      status: "blocked",
      health: "BLOCKED",
      modules: ["TPRM", "Breach Management"],
      description: "Third-party risk management and breach workflow integration, on-prem deployment.",
      activities: [
        act({ date: "2026-06-15", activityType: "MEETING", description: "Kickoff and architecture review", ownerType: "PROJECT / PM", owner: "Ankur", dependencySide: "Internal", status: "COMPLETED" }),
        act({ date: "2026-07-01", activityType: "REQUEST", description: "On-prem server provisioning requested", ownerType: "CLIENT", owner: "Adani IT", dependencySide: "Client", requestedBy: "IDfy", requestedDate: "2026-07-01", expectedDate: "2026-07-10", receivedDate: "", status: "BLOCKED", impact: "Cannot begin installation without provisioned servers" })
      ],
      auditLog: [
        { date: "2026-07-15", text: "Status changed: Planned → Blocked" }
      ]
    });

    // 8. Godrej — in progress, five connected assets
    projects.push({
      id: generateId("proj"),
      client: "Godrej",
      projectName: "Data Compass Multi-Asset Classification",
      projectType: "LIVE",
      environment: "Cloud",
      cloudProvider: "GCP",
      infrastructureOwnership: "Shared",
      owner: "Ankur",
      startDate: "2026-06-20",
      targetDate: "2026-09-05",
      status: "in-progress",
      health: "AT RISK",
      modules: ["Data Compass"],
      description: "Classification rollout across five connected data assets for Godrej group entities.",
      activities: [
        act({ date: "2026-06-20", activityType: "MEETING", description: "Kickoff — five connected assets scoped", ownerType: "PROJECT / PM", owner: "Ankur", dependencySide: "Internal", status: "COMPLETED" }),
        act({ date: "2026-07-18", activityType: "ACTION", description: "Classification completed on 3 of 5 assets", ownerType: "INTERNAL TECH TEAM", owner: "IDfy Engineering", dependencySide: "Internal", status: "COMPLETED" }),
        act({ date: "2026-08-05", activityType: "REQUEST", description: "Access credentials requested for remaining 2 assets", ownerType: "CLIENT", owner: "Godrej IT", dependencySide: "Client", requestedBy: "IDfy", requestedDate: "2026-08-05", expectedDate: "2026-08-09", receivedDate: "", status: "WAITING" })
      ],
      auditLog: [
        { date: "2026-08-05", text: "Dependency added: Godrej IT — access credentials" }
      ]
    });

    return projects;
  }

  return {
    TODAY: TODAY,
    PROJECT_TYPES: PROJECT_TYPES,
    STATUSES: STATUSES,
    HEALTHS: HEALTHS,
    ENV_TYPES: ENV_TYPES,
    CLOUD_PROVIDERS: CLOUD_PROVIDERS,
    INFRA_OWNERSHIP: INFRA_OWNERSHIP,
    MODULES: MODULES,
    ACTIVITY_TYPES: ACTIVITY_TYPES,
    OWNER_TYPES: OWNER_TYPES,
    DEPENDENCY_SIDES: DEPENDENCY_SIDES,
    ACTIVITY_STATUSES: ACTIVITY_STATUSES,
    generateId: generateId,
    parseDate: parseDate,
    formatDate: formatDate,
    todayStr: todayStr,
    daysBetween: daysBetween,
    daysFromToday: daysFromToday,
    calcWaiting: calcWaiting,
    calcProjectAnalytics: calcProjectAnalytics,
    currentDependency: currentDependency,
    progressFor: progressFor,
    sampleProjects: sampleProjects
  };
})();
