# IDfy Project Tracker

A project portfolio and delivery tracker for managing multiple IDfy/Privy client
projects. It answers the questions a Project Manager actually needs answered:
what's currently active, what was requested, who owns the pending dependency,
how long has it been waiting, and how much of the elapsed calendar time was
active work versus time lost to dependencies.

**Kanban = current state. Timeline = historical truth. Analytics = what actually happened.**

## Running it

No build step, no server, no dependencies. Just open `index.html` in a
browser. All data is stored in `localStorage` and persists across refreshes.

To host it on GitHub Pages:

1. Push this folder to a repository (e.g. `IDfy`).
2. Enable GitHub Pages for the repo (Settings → Pages → deploy from branch).
3. The app will be available at `https://USERNAME.github.io/IDfy/`.

All paths in `index.html` are relative, so it works from any sub-path.

## File structure

```
index.html
css/
    styles.css
js/
    storage.js     localStorage persistence (load/save/export/import)
    data.js        constants, date helpers, waiting/duration calculations, sample data
    kanban.js      Kanban board rendering + drag-and-drop
    timeline.js    per-project vertical timeline + global cross-project timeline table
    analytics.js   Analytics page (distributions, waiting-time breakdown, top offenders)
    app.js         application controller: state, navigation, modals, CRUD
README.md
```

## Core concepts

- **Status** vs **Health** are independent fields. Status is the Kanban column
  (Backlog / Planned / In Progress / Blocked / UAT / Completed). Health is a
  risk signal (On Track / At Risk / Delayed / Blocked).
- **Waiting** means something was requested and a response is pending.
  **Blocked** means work cannot proceed even though nothing is formally
  outstanding — they're tracked and displayed separately.
- Every activity that has a `Requested Date` contributes to waiting-time
  analytics, attributed to a **Dependency Side** (Client / Internal / Other)
  set on the activity itself.
- Waiting days for an unresolved request = today − requested date (future
  requested dates never count). Once a `Received Date` is filled in, waiting
  days = received date − requested date, and it stops counting.

## Data model

```js
project = {
  id, client, projectName, projectType,          // POC | LIVE
  environment, cloudProvider, infrastructureOwnership,
  owner, startDate, targetDate,
  status,                                         // backlog | planned | in-progress | blocked | uat | completed
  health,                                         // ON TRACK | AT RISK | DELAYED | BLOCKED
  modules: [],                                    // CGP, DPRM, Cookie Manager, Data Compass, DPIA, ...
  description,
  activities: [ activity ],
  auditLog: [ { date, text } ]
}

activity = {
  id, date, activityType, description,
  ownerType,                                      // CLIENT | INTERNAL TECH TEAM | PROJECT / PM | SECURITY | DEVOPS | PRODUCT | OTHER
  owner, dependencySide,                           // Client | Internal | Other — used for waiting attribution
  requestedBy, requestedDate, expectedDate, receivedDate,
  status,                                          // OPEN | WAITING | PARTIALLY RECEIVED | RECEIVED | COMPLETED | BLOCKED | CANCELLED
  impact, relatedPhase, notes
}
```

## Sample data

The app ships with 8 realistic sample projects (HSBC, Punjab & Sind Bank,
Axis Bank, Nuvama, ICICI Lombard, Alkem Laboratories, Adani, Godrej), three of
which (HSBC, Punjab & Sind Bank, Axis Bank) have detailed activity histories
so the timeline and waiting-time calculations have something real to show.
Use **Settings → Reset to sample data** at any time to restore this starting
point, or **Clear all data** to start from an empty board.

## What's implemented

Add / edit / delete projects and activities · drag-and-drop Kanban with
persisted status changes · project detail drawer with dependency tracking,
waiting-time analytics, vertical timeline, and an automatic audit log ·
global Timeline page with multi-field filtering · Analytics page (status,
type, environment, module, and health distributions; client vs. internal vs.
other waiting time; top-waiting and currently-blocked projects) · global
search · combinable filters (type, environment, status, health, module,
dependency owner) · JSON export/import · responsive layout down to tablet
width.
