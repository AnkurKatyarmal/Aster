/* ==========================================================================
   Ankur's Project Tracker — data.js
   Constants, date helpers, waiting/analytics calculations, sample data.
   ========================================================================== */

var Data = (function () {
  "use strict";

  // The real current date, zeroed to midnight so date-only comparisons
  // (parseDate() also produces midnight-anchored dates) line up correctly.
  // IMPORTANT: this must stay dynamic — a hardcoded date here would freeze
  // every waiting-day / elapsed-day calculation in the whole app at that
  // fixed point, silently going stale as real time moves forward.
  var TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);

  // Relative-to-today date helpers, used only by sampleProjects() below so
  // the demo data always reads as "recent" no matter when it's viewed or
  // reset, instead of drifting into the past as real time moves forward.
  function daysAgo(n) {
    var d = new Date(TODAY.getTime());
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
  function daysFromNow(n) { return daysAgo(-n); }

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
  var INFRA_OWNERSHIP = ["Internal", "Client", "Shared"];

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
    "Client",
    "Internal Tech Team",
    "Project / PM",
    "Security",
    "DevOps",
    "Product",
    "Sales",
    "Pre-Sales",
    "Other"
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

  // Matches the "Implementation Phase" column used in the real PMO Weekly
  // Program Bulletin, plus two POC-stage phases (Kickoff, Prerequisites)
  // that come before a project reaches "Initiation" in that model.
  var IMPLEMENTATION_PHASES = [
    "Kickoff",
    "Prerequisites",
    "Initiation",
    "Discovery",
    "Solution Design",
    "Infrastructure Procurement",
    "Build / Configuration",
    "Integration",
    "SIT",
    "UAT",
    "Go-Live",
    "Hypercare",
    "Closed"
  ];

  // Common recurring impact statements — quick-select, but the field still
  // accepts free text since real impact statements are often one-off.
  var IMPACT_SUGGESTIONS = [
    "Blocks UAT environment setup",
    "Blocks Go-Live",
    "Blocks Production Deployment",
    "Blocks Integration",
    "Blocks taxonomy/notice configuration",
    "Delays project timeline",
    "No response from client"
  ];

  // -- risk register --------------------------------------------------
  var RISK_CATEGORIES = [
    "Technical",
    "Schedule / Timeline",
    "Resource",
    "Client / Stakeholder",
    "Vendor / Third-Party",
    "Compliance / Regulatory",
    "Security",
    "Commercial / Financial",
    "Operational / Infrastructure",
    "Quality",
    "Scope",
    "Communication"
  ];
  var RISK_LEVELS = ["Low", "Medium", "High"];
  var RISK_STATUSES = ["Open", "Mitigating", "Escalated", "Closed", "Accepted"];

  // Standard 3x3 likelihood x impact matrix -> Low/Medium/High/Critical.
  var RISK_SCORE_MATRIX = {
    "Low|Low": "Low", "Low|Medium": "Low", "Low|High": "Medium",
    "Medium|Low": "Low", "Medium|Medium": "Medium", "Medium|High": "High",
    "High|Low": "Medium", "High|Medium": "High", "High|High": "Critical"
  };
  function computeRiskScore(likelihood, impact) {
    return RISK_SCORE_MATRIX[likelihood + "|" + impact] || "Medium";
  }
  // Sort order for showing the most severe risks first.
  var RISK_SCORE_RANK = { "Critical": 3, "High": 2, "Medium": 1, "Low": 0 };

  // Starter team directory seeded from the real PMO Weekly Program
  // Bulletin's Owner / Pre-Sales & Sales Team columns. Editable by an admin
  // in Settings — this is just a reasonable starting point, not gospel.
  var DEFAULT_TEAM_DIRECTORY = {
    delivery: [
      "Ankur Katyarmal", "Sarvesh Shroff", "Jitendra Bhosle", "Pranitha",
      "Lakshaya", "Puja", "Shreyas Waingankar", "Sachin Gaikwad", "Shruti Patel"
    ],
    salesPresales: [
      "Nikhil Jhanji", "Anmol", "Puru Jain", "Sumeet Gaikwad", "Raj Parmar",
      "Mayank", "Swapnil", "Rushabh", "Sumit Gaikwad"
    ]
  };

  // -- lookups used by the UI and the Excel importer, so both agree on
  //    exactly the same label <-> key mapping and fuzzy matching rules ---
  function statusKeyFromLabel(label) {
    var found = STATUSES.filter(function (s) {
      return s.label.toLowerCase() === String(label || "").trim().toLowerCase();
    })[0];
    return found ? found.key : null;
  }
  function statusLabelFromKey(key) {
    var found = STATUSES.filter(function (s) { return s.key === key; })[0];
    return found ? found.label : null;
  }
  // Case/whitespace-insensitive match against a fixed list of allowed
  // values (e.g. "on track" -> "ON TRACK"). Returns null if no match.
  function fuzzyMatch(value, allowedList) {
    var norm = String(value || "").trim().toLowerCase();
    var found = allowedList.filter(function (v) { return v.toLowerCase() === norm; })[0];
    return found || null;
  }
  // Splits a comma/semicolon-separated cell into a clean module list,
  // matching each piece against Data.MODULES case-insensitively.
  function parseModuleList(cell) {
    if (!cell) return [];
    return String(cell).split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean)
      .map(function (s) { return fuzzyMatch(s, MODULES) || s; });
  }

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

  // Counts weekdays (Mon-Fri) strictly between two dates — used for waiting
  // time specifically, since a client or internal team isn't "waiting" over
  // a weekend in any actionable sense. Total Elapsed stays calendar-based
  // elsewhere (a project genuinely spans that many real days).
  function businessDaysBetween(a, b) {
    var da = parseDate(a);
    var db = parseDate(b);
    if (!da || !db) return 0;
    var start = da, end = db, sign = 1;
    if (start.getTime() > end.getTime()) { var t = start; start = end; end = t; sign = -1; }
    var count = 0;
    var cur = new Date(start.getTime());
    cur.setDate(cur.getDate() + 1);
    while (cur.getTime() <= end.getTime()) {
      var dow = cur.getDay(); // 0 = Sunday, 6 = Saturday
      if (dow !== 0 && dow !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return sign * count;
  }

  function businessDaysFromToday(str) {
    return businessDaysBetween(str, todayStr());
  }

  // -- waiting calculation for a single activity --------------------------
  // Returns { isWaiting, days, resolved }
  function calcWaiting(activity) {
    if (!activity.requestedDate) return { isWaiting: false, days: 0, resolved: false };
    var reqD = parseDate(activity.requestedDate);
    if (!reqD) return { isWaiting: false, days: 0, resolved: false };

    if (activity.receivedDate) {
      var days = businessDaysBetween(activity.requestedDate, activity.receivedDate);
      return { isWaiting: false, days: Math.max(days, 0), resolved: true };
    }

    // No received date yet — only count if requested date is not in the future
    if (reqD.getTime() > TODAY.getTime()) {
      return { isWaiting: false, days: 0, resolved: false };
    }
    var openStatuses = ["OPEN", "WAITING", "PARTIALLY RECEIVED", "BLOCKED"];
    var stillOpen = openStatuses.indexOf(activity.status) !== -1;
    var days2 = businessDaysFromToday(activity.requestedDate);
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
        ownerType: "Internal Tech Team",
        owner: "Ankur Katyarmal",
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

    // 1. HSBC — resolved: deployment blocker cleared, now live and stable
    projects.push({
      id: generateId("proj"),
      client: "HSBC",
      projectName: "Privy Implementation",
      projectType: "LIVE",
      environment: "Cloud",
      cloudProvider: "GCP",
      infrastructureOwnership: "Client",
      owner: "Ankur",
      startDate: daysAgo(110),
      targetDate: daysAgo(5),
      status: "completed",
      health: "ON TRACK",
      modules: ["CGP", "DPRM", "Cookie Manager"],
      description: "Consent Governance Platform, DPRM and Cookie Manager rollout on HSBC-owned GCP infrastructure.",
      activities: [
        act({ date: daysAgo(105), activityType: "DELIVERABLE", description: "Docker Hub invitation accepted", ownerType: "Client", owner: "HSBC IT", dependencySide: "Client", status: "RECEIVED", relatedPhase: "Prerequisites" }),
        act({ date: daysAgo(105), activityType: "DELIVERABLE", description: "Consent form shared", ownerType: "Client", owner: "HSBC DPO", dependencySide: "Client", status: "COMPLETED", relatedPhase: "Prerequisites", notes: "Prerequisites completed" }),
        act({ date: daysAgo(95), activityType: "DELIVERABLE", description: "UAT SaaS API credentials shared", ownerType: "Internal Tech Team", owner: "Ankur Katyarmal", dependencySide: "Internal", status: "COMPLETED", relatedPhase: "UAT Setup", notes: "Dependency: HSBC DevOps for validation" }),
        act({ date: daysAgo(91), activityType: "ACTION", description: "Production image preparation started", ownerType: "Internal Tech Team", owner: "Engineering Team", dependencySide: "Internal", status: "COMPLETED", relatedPhase: "Build" }),
        act({ date: daysAgo(91), activityType: "DISCUSSION", description: "G3 CD pipeline configuration discussed", ownerType: "DevOps", owner: "HSBC DevOps", dependencySide: "Client", status: "COMPLETED", relatedPhase: "Deployment Planning", impact: "Finalize deployment architecture" }),
        act({ date: daysAgo(81), activityType: "DELIVERABLE", description: "VAPT report shared", ownerType: "Security", owner: "Security Team", dependencySide: "Internal", status: "COMPLETED", relatedPhase: "Security Review", notes: "Dependency: HSBC security review" }),
        act({ date: daysAgo(35), activityType: "DEPLOYMENT", description: "Infrastructure deployment started", ownerType: "DevOps", owner: "HSBC DevOps", dependencySide: "Client", requestedBy: "Ankur Katyarmal", requestedDate: daysAgo(35), expectedDate: daysAgo(34), receivedDate: daysAgo(30), status: "RECEIVED", relatedPhase: "Deployment", impact: "Deployment delayed by client infra readiness" }),
        act({ date: daysAgo(33), activityType: "REQUEST", description: "API encryption confirmation requested", ownerType: "DevOps", owner: "HSBC DevOps", dependencySide: "Client", requestedBy: "Ankur Katyarmal", requestedDate: daysAgo(33), expectedDate: daysAgo(32), receivedDate: daysAgo(28), status: "RECEIVED", relatedPhase: "Deployment" }),
        act({ date: daysAgo(6), activityType: "PRODUCTION", description: "Production go-live completed — CGP, DPRM & Cookie Manager now live on HSBC GCP infrastructure", status: "COMPLETED", relatedPhase: "Go-Live" }),
        act({ date: daysAgo(2), activityType: "STATUS UPDATE", description: "Post go-live monitoring — no issues reported in first week", status: "COMPLETED" })
      ],
      auditLog: [
        { date: daysAgo(6), text: "Status changed: Blocked → Completed" },
        { date: daysAgo(30), text: "Dependency resolved: HSBC DevOps — infrastructure deployment received" },
        { date: daysAgo(35), text: "Status changed: In Progress → Blocked" }
      ],
      risks: [
        {
          id: generateId("risk"), category: "Vendor / Third-Party",
          description: "HSBC DevOps had been slow to respond on infrastructure deployment and API encryption confirmation — pattern suggested possible resourcing constraints on their side.",
          likelihood: "Medium", impact: "High", riskScore: computeRiskScore("Medium", "High"),
          status: "Closed", owner: "Ankur Katyarmal", mitigationPlan: "Escalated via weekly steering call; a dedicated HSBC DevOps point of contact was assigned for the remainder of deployment.",
          identifiedDate: daysAgo(33), targetResolutionDate: daysAgo(26)
        }
      ]
    });

    // 2. Punjab & Sind Bank — resolved: UAT signed off, now in production
    projects.push({
      id: generateId("proj"),
      client: "Punjab & Sind Bank",
      projectName: "Digital Apna Vahan — CMS Integration",
      projectType: "POC",
      environment: "SaaS",
      cloudProvider: "",
      infrastructureOwnership: "Internal",
      owner: "Ankur",
      startDate: daysAgo(75),
      targetDate: daysAgo(3),
      status: "completed",
      health: "ON TRACK",
      modules: ["CGP", "DPRM"],
      description: "Vehicle loan journey consent capture via iFrame-embedded Privy CMS, webhook-driven confirmation.",
      activities: [
        act({ date: daysAgo(75), activityType: "MEETING", description: "Kickoff call — journey mapping for Digital Apna Vahan", ownerType: "Project / PM", owner: "Ankur", status: "COMPLETED" }),
        act({ date: daysAgo(68), activityType: "DELIVERABLE", description: "FSD V1 shared with PSB IT team", status: "COMPLETED" }),
        act({ date: daysAgo(61), activityType: "REQUEST", description: "Requested confirmation on consent-before-OTP sequencing", ownerType: "Client", owner: "PSB IT", dependencySide: "Client", requestedBy: "Ankur Katyarmal", requestedDate: daysAgo(61), expectedDate: daysAgo(58), receivedDate: daysAgo(54), status: "RECEIVED" }),
        act({ date: daysAgo(52), activityType: "DECISION", description: "Removed postMessage/JS listener mechanism in favour of webhook confirmation", ownerType: "Project / PM", owner: "Ankur", status: "COMPLETED" }),
        act({ date: daysAgo(43), activityType: "DELIVERABLE", description: "FSD V4 and standalone iFrame integration guide delivered", status: "COMPLETED" }),
        act({ date: daysAgo(34), activityType: "UAT", description: "UAT environment access requested from PSB", ownerType: "Client", owner: "PSB DevOps", dependencySide: "Client", requestedBy: "Ankur Katyarmal", requestedDate: daysAgo(34), expectedDate: daysAgo(32), receivedDate: daysAgo(32), status: "RECEIVED" }),
        act({ date: daysAgo(32), activityType: "UAT", description: "UAT execution started on webhook confirmation flow", status: "COMPLETED" }),
        act({ date: daysAgo(4), activityType: "UAT", description: "UAT sign-off received from PSB; production rollout approved", ownerType: "Client", owner: "PSB IT", dependencySide: "Client", requestedBy: "Ankur Katyarmal", requestedDate: daysAgo(6), expectedDate: daysAgo(5), receivedDate: daysAgo(4), status: "RECEIVED" }),
        act({ date: daysAgo(3), activityType: "PRODUCTION", description: "Production rollout completed for Digital Apna Vahan consent journey", status: "COMPLETED", relatedPhase: "Go-Live" })
      ],
      auditLog: [
        { date: daysAgo(3), text: "Status changed: UAT → Completed" },
        { date: daysAgo(32), text: "Status changed: In Progress → UAT" }
      ]
    });

    // 3. Axis Bank — resolved: firewall exception approved, classification complete, health recovered
    projects.push({
      id: generateId("proj"),
      client: "Axis Bank",
      projectName: "Data Compass Rollout",
      projectType: "LIVE",
      environment: "On-Prem",
      cloudProvider: "",
      infrastructureOwnership: "Client",
      owner: "Ankur",
      startDate: daysAgo(120),
      targetDate: daysFromNow(10),
      status: "in-progress",
      health: "ON TRACK",
      modules: ["Data Compass"],
      description: "Data discovery and classification rollout across Axis on-prem clusters.",
      activities: [
        act({ date: daysAgo(120), activityType: "MEETING", description: "Project kickoff and scoping", ownerType: "Project / PM", owner: "Ankur", status: "COMPLETED" }),
        act({ date: daysAgo(108), activityType: "REQUEST", description: "Requested cluster port access list from Axis network team", ownerType: "Client", owner: "Axis Network Team", dependencySide: "Client", requestedBy: "Ankur Katyarmal", requestedDate: daysAgo(108), expectedDate: daysAgo(105), receivedDate: daysAgo(90), status: "RECEIVED", impact: "Delayed environment setup by 2 weeks" }),
        act({ date: daysAgo(88), activityType: "ACTION", description: "Cluster connectivity established", ownerType: "Internal Tech Team", owner: "Engineering Team", status: "COMPLETED" }),
        act({ date: daysAgo(75), activityType: "BLOCKER", description: "Firewall rules blocking classification scans", ownerType: "DevOps", owner: "Axis Infra", dependencySide: "Client", requestedBy: "Ankur Katyarmal", requestedDate: daysAgo(75), expectedDate: daysAgo(72), receivedDate: daysAgo(38), status: "RECEIVED", impact: "Classification jobs cannot run" }),
        act({ date: daysAgo(60), activityType: "DISCUSSION", description: "Escalation call with Axis IT leadership on firewall delay", ownerType: "Project / PM", owner: "Ankur", status: "COMPLETED" }),
        act({ date: daysAgo(41), activityType: "STATUS UPDATE", description: "Leadership briefing and delay timeline shared internally", ownerType: "Project / PM", owner: "Ankur", status: "COMPLETED" }),
        act({ date: daysAgo(38), activityType: "ACTION", description: "Firewall exception approved; classification scans resumed", ownerType: "DevOps", owner: "Axis Infra", dependencySide: "Client", status: "COMPLETED", relatedPhase: "Integration" }),
        act({ date: daysAgo(7), activityType: "ACTION", description: "Classification completed across all on-prem clusters", ownerType: "Internal Tech Team", owner: "Engineering Team", status: "COMPLETED", relatedPhase: "Build / Configuration" }),
        act({ date: daysAgo(1), activityType: "STATUS UPDATE", description: "Final report review scheduled with Axis IT; go-live expected within target window", ownerType: "Project / PM", owner: "Ankur", status: "COMPLETED" })
      ],
      auditLog: [
        { date: daysAgo(38), text: "Status changed: Blocked → In Progress" },
        { date: daysAgo(75), text: "Status changed: In Progress → Blocked" }
      ],
      risks: [
        {
          id: generateId("risk"), category: "Schedule / Timeline",
          description: "Two prior slippages (network access delay, firewall blocker) had eaten into buffer — further client-side delay would have put the target completion date at risk.",
          likelihood: "High", impact: "Medium", riskScore: computeRiskScore("High", "Medium"),
          status: "Closed", owner: "Ankur Katyarmal", mitigationPlan: "Weekly leadership sync with Axis IT kept firewall/network readiness as a standing agenda item until resolved.",
          identifiedDate: daysAgo(60), targetResolutionDate: daysAgo(35)
        }
      ]
    });

    // 4. Nuvama — sandbox received, POC now actively underway
    projects.push({
      id: generateId("proj"),
      client: "Nuvama",
      projectName: "Consent Governance POC",
      projectType: "POC",
      environment: "Cloud",
      cloudProvider: "AWS",
      infrastructureOwnership: "Shared",
      owner: "Ankur",
      startDate: daysAgo(50),
      targetDate: daysFromNow(25),
      status: "in-progress",
      health: "ON TRACK",
      modules: ["CGP"],
      description: "Initial CGP proof of concept for wealth management consent flows.",
      activities: [
        act({ date: daysAgo(50), activityType: "MEETING", description: "Discovery call with Nuvama compliance team", ownerType: "Project / PM", owner: "Ankur", status: "COMPLETED" }),
        act({ date: daysAgo(38), activityType: "REQUEST", description: "Sandbox AWS account details requested", ownerType: "Client", owner: "Nuvama IT", dependencySide: "Client", requestedBy: "Ankur Katyarmal", requestedDate: daysAgo(38), expectedDate: daysAgo(31), receivedDate: daysAgo(25), status: "RECEIVED" }),
        act({ date: daysAgo(20), activityType: "ACTION", description: "Sandbox environment provisioned; CGP configuration started", status: "COMPLETED", relatedPhase: "Build / Configuration" }),
        act({ date: daysAgo(3), activityType: "DISCUSSION", description: "Reviewed initial purpose taxonomy with Nuvama compliance team", ownerType: "Client", owner: "Nuvama Compliance", dependencySide: "Client", status: "COMPLETED" })
      ],
      auditLog: [
        { date: daysAgo(20), text: "Status changed: Planned → In Progress" },
        { date: daysAgo(50), text: "Project created" }
      ]
    });

    // 5. ICICI Lombard — completed, stable in hypercare
    projects.push({
      id: generateId("proj"),
      client: "ICICI Lombard",
      projectName: "Cookie Consent Manager",
      projectType: "LIVE",
      environment: "Cloud",
      cloudProvider: "Azure",
      infrastructureOwnership: "Internal",
      owner: "Ankur",
      startDate: daysAgo(140),
      targetDate: daysAgo(95),
      status: "completed",
      health: "ON TRACK",
      modules: ["Cookie Manager"],
      description: "Cookie Consent Manager implementation across policy microsites.",
      activities: [
        act({ date: daysAgo(140), activityType: "MEETING", description: "Kickoff", ownerType: "Project / PM", owner: "Ankur", status: "COMPLETED" }),
        act({ date: daysAgo(129), activityType: "DEPLOYMENT", description: "Production deployment completed", ownerType: "Internal Tech Team", owner: "Engineering Team", status: "COMPLETED" }),
        act({ date: daysAgo(95), activityType: "PRODUCTION", description: "Go-live sign-off received", ownerType: "Client", owner: "ICICI Lombard IT", dependencySide: "Client", requestedBy: "Ankur Katyarmal", requestedDate: daysAgo(100), expectedDate: daysAgo(98), receivedDate: daysAgo(95), status: "RECEIVED" }),
        act({ date: daysAgo(10), activityType: "STATUS UPDATE", description: "Quarterly health check — no issues, consent capture rates stable", ownerType: "Project / PM", owner: "Ankur", status: "COMPLETED", relatedPhase: "Hypercare" })
      ],
      auditLog: [
        { date: daysAgo(95), text: "Status changed: UAT → Completed" }
      ]
    });

    // 6. Alkem — progressed from backlog into active scoping
    projects.push({
      id: generateId("proj"),
      client: "Alkem Laboratories",
      projectName: "DPIA Assessment",
      projectType: "POC",
      environment: "SaaS",
      cloudProvider: "",
      infrastructureOwnership: "Internal",
      owner: "Ankur",
      startDate: daysAgo(38),
      targetDate: daysFromNow(45),
      status: "planned",
      health: "ON TRACK",
      modules: ["DPIA"],
      description: "Data Protection Impact Assessment scoping for pharma distribution systems.",
      activities: [
        act({ date: daysAgo(38), activityType: "REQUEST", description: "Initial scoping questionnaire sent to Alkem", ownerType: "Client", owner: "Alkem Compliance", dependencySide: "Client", requestedBy: "Ankur Katyarmal", requestedDate: daysAgo(38), expectedDate: daysAgo(28), receivedDate: daysAgo(15), status: "RECEIVED" }),
        act({ date: daysAgo(12), activityType: "MEETING", description: "DPIA workshop conducted with Alkem compliance & pharma distribution teams", ownerType: "Client", owner: "Alkem Compliance", dependencySide: "Client", status: "COMPLETED" }),
        act({ date: daysAgo(2), activityType: "DELIVERABLE", description: "Draft DPIA scope document shared for review", status: "COMPLETED", relatedPhase: "Discovery" })
      ],
      auditLog: [
        { date: daysAgo(15), text: "Status changed: Backlog → Planned" },
        { date: daysAgo(38), text: "Project created" }
      ]
    });

    // 7. Adani — cloud sandbox fallback unblocked configuration work; on-prem still pending
    projects.push({
      id: generateId("proj"),
      client: "Adani",
      projectName: "TPRM Integration",
      projectType: "POC",
      environment: "On-Prem",
      cloudProvider: "",
      infrastructureOwnership: "Client",
      owner: "Ankur",
      startDate: daysAgo(93),
      targetDate: daysFromNow(20),
      status: "in-progress",
      health: "AT RISK",
      modules: ["TPRM", "Breach Management"],
      description: "Third-party risk management and breach workflow integration, on-prem deployment.",
      activities: [
        act({ date: daysAgo(93), activityType: "MEETING", description: "Kickoff and architecture review", ownerType: "Project / PM", owner: "Ankur", status: "COMPLETED" }),
        act({ date: daysAgo(77), activityType: "REQUEST", description: "On-prem server provisioning requested", ownerType: "Client", owner: "Adani IT", dependencySide: "Client", requestedBy: "Ankur Katyarmal", requestedDate: daysAgo(77), expectedDate: daysAgo(68), receivedDate: "", status: "BLOCKED", impact: "Cannot begin installation without provisioned servers" }),
        act({ date: daysAgo(25), activityType: "ACTION", description: "Cloud sandbox fallback approved and provisioned; TPRM + Breach Management configuration started in parallel", status: "COMPLETED", relatedPhase: "Infrastructure Procurement", impact: "Unblocks configuration work while on-prem provisioning continues" }),
        act({ date: daysAgo(4), activityType: "STATUS UPDATE", description: "On-prem servers still pending; sandbox-based configuration approximately 60% complete", ownerType: "Project / PM", owner: "Ankur", status: "COMPLETED" })
      ],
      auditLog: [
        { date: daysAgo(25), text: "Status changed: Blocked → In Progress" },
        { date: daysAgo(62), text: "Status changed: Planned → Blocked" }
      ],
      risks: [
        {
          id: generateId("risk"), category: "Operational / Infrastructure",
          description: "On-prem server provisioning remains stalled with no firm date from Adani IT. A cloud sandbox fallback is keeping configuration work moving, but final deployment still depends on the on-prem environment landing before the POC window closes.",
          likelihood: "High", impact: "High", riskScore: computeRiskScore("High", "High"),
          status: "Mitigating", owner: "Ankur Katyarmal", mitigationPlan: "Continuing configuration on the cloud sandbox in parallel; escalated on-prem timeline to Adani leadership with a revised target.",
          identifiedDate: daysAgo(77), targetResolutionDate: daysFromNow(15)
        }
      ]
    });

    // 8. Godrej — all five assets classified, signed off and completed
    projects.push({
      id: generateId("proj"),
      client: "Godrej",
      projectName: "Data Compass Multi-Asset Classification",
      projectType: "LIVE",
      environment: "Cloud",
      cloudProvider: "GCP",
      infrastructureOwnership: "Shared",
      owner: "Ankur",
      startDate: daysAgo(88),
      targetDate: daysAgo(8),
      status: "completed",
      health: "ON TRACK",
      modules: ["Data Compass"],
      description: "Classification rollout across five connected data assets for Godrej group entities.",
      activities: [
        act({ date: daysAgo(88), activityType: "MEETING", description: "Kickoff — five connected assets scoped", ownerType: "Project / PM", owner: "Ankur", status: "COMPLETED" }),
        act({ date: daysAgo(60), activityType: "ACTION", description: "Classification completed on 3 of 5 assets", ownerType: "Internal Tech Team", owner: "Engineering Team", status: "COMPLETED" }),
        act({ date: daysAgo(43), activityType: "REQUEST", description: "Access credentials requested for remaining 2 assets", ownerType: "Client", owner: "Godrej IT", dependencySide: "Client", requestedBy: "Ankur Katyarmal", requestedDate: daysAgo(43), expectedDate: daysAgo(39), receivedDate: daysAgo(30), status: "RECEIVED" }),
        act({ date: daysAgo(28), activityType: "ACTION", description: "Classification completed on remaining 2 assets — all 5 connected assets now classified", ownerType: "Internal Tech Team", owner: "Engineering Team", status: "COMPLETED" }),
        act({ date: daysAgo(9), activityType: "PRODUCTION", description: "Final classification report delivered and signed off by Godrej data governance team", ownerType: "Client", owner: "Godrej IT", dependencySide: "Client", status: "RECEIVED", relatedPhase: "Go-Live" })
      ],
      auditLog: [
        { date: daysAgo(9), text: "Status changed: In Progress → Completed" },
        { date: daysAgo(43), text: "Dependency added: Godrej IT — access credentials" }
      ]
    });

    // 9. Bajaj Allianz — brand-new engagement, kicked off in the last few days
    projects.push({
      id: generateId("proj"),
      client: "Bajaj Allianz",
      projectName: "Cookie & Consent Compliance POC",
      projectType: "POC",
      environment: "Cloud",
      cloudProvider: "Azure",
      infrastructureOwnership: "Shared",
      owner: "Ankur",
      startDate: daysAgo(4),
      targetDate: daysFromNow(50),
      status: "planned",
      health: "ON TRACK",
      modules: ["CGP", "Cookie Manager"],
      description: "Cookie consent scanning and Consent Governance Platform POC for Bajaj Allianz's policy issuance microsites.",
      activities: [
        act({ date: daysAgo(4), activityType: "MEETING", description: "Kickoff call — scoping Cookie Manager + CGP for policy microsites", ownerType: "Project / PM", owner: "Ankur", status: "COMPLETED", relatedPhase: "Kickoff" }),
        act({ date: daysAgo(3), activityType: "DELIVERABLE", description: "Shared POC pre-requisites — API guide, cookie scan methodology, sample taxonomy", status: "COMPLETED", relatedPhase: "Prerequisites" }),
        act({ date: daysAgo(1), activityType: "REQUEST", description: "Requested domain access and admin user details for cookie scan", ownerType: "Client", owner: "Bajaj Allianz IT", dependencySide: "Client", requestedBy: "Ankur Katyarmal", requestedDate: daysAgo(1), expectedDate: daysFromNow(4), receivedDate: "", status: "WAITING", relatedPhase: "Prerequisites" })
      ],
      auditLog: [
        { date: daysAgo(4), text: "Project created" }
      ],
      risks: [
        {
          id: generateId("risk"), category: "Vendor / Third-Party",
          description: "Bajaj Allianz runs a multi-vendor microsite setup with a third-party CMS — cookie scan coverage may be incomplete without cooperation from their web vendor.",
          likelihood: "Medium", impact: "Medium", riskScore: computeRiskScore("Medium", "Medium"),
          status: "Open", owner: "Ankur Katyarmal", mitigationPlan: "Request the web vendor's contact early; scope a phased scan starting with primary domains.",
          identifiedDate: daysAgo(3), targetResolutionDate: daysFromNow(10)
        }
      ]
    });

    projects.forEach(function (p) { if (p.ownerEmail == null) p.ownerEmail = ""; });
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
    IMPLEMENTATION_PHASES: IMPLEMENTATION_PHASES,
    IMPACT_SUGGESTIONS: IMPACT_SUGGESTIONS,
    DEFAULT_TEAM_DIRECTORY: DEFAULT_TEAM_DIRECTORY,
    DEPENDENCY_SIDES: DEPENDENCY_SIDES,
    ACTIVITY_STATUSES: ACTIVITY_STATUSES,
    generateId: generateId,
    RISK_CATEGORIES: RISK_CATEGORIES,
    RISK_LEVELS: RISK_LEVELS,
    RISK_STATUSES: RISK_STATUSES,
    RISK_SCORE_RANK: RISK_SCORE_RANK,
    computeRiskScore: computeRiskScore,
    statusKeyFromLabel: statusKeyFromLabel,
    statusLabelFromKey: statusLabelFromKey,
    fuzzyMatch: fuzzyMatch,
    parseModuleList: parseModuleList,
    parseDate: parseDate,
    formatDate: formatDate,
    todayStr: todayStr,
    daysBetween: daysBetween,
    businessDaysBetween: businessDaysBetween,
    businessDaysFromToday: businessDaysFromToday,
    daysFromToday: daysFromToday,
    calcWaiting: calcWaiting,
    calcProjectAnalytics: calcProjectAnalytics,
    currentDependency: currentDependency,
    progressFor: progressFor,
    sampleProjects: sampleProjects
  };
})();
