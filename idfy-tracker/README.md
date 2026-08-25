# IDfy Project Tracker

A project portfolio and delivery tracker for IDfy/Privy client engagements.
Answers: what's currently active, what was requested, who owns the pending
dependency, how long has it been waiting, and how much elapsed time was
active work versus time lost to dependencies.

**Kanban = current state. Timeline = historical truth. Analytics = what actually happened.**

## Running it

No build step. Open `index.html` in a browser, or host the folder anywhere
static (GitHub Pages, Netlify, etc.). All paths are relative.

The app runs in one of two modes, decided automatically:

| | **Local mode** (default) | **Cloud mode** |
|---|---|---|
| Setup | None | Fill in `js/firebase-config.js` |
| Sign-in | None — anyone with the link has full access | Google sign-in, gated by admin approval |
| Storage | This browser's `localStorage` only | Shared Firestore — everyone approved sees the same live data |
| Best for | Trying it out, solo use | A team that needs shared, access-controlled data |

---

## Setting up Cloud mode (Google login + shared storage)

This uses **Firebase** (Google's backend-as-a-service). Free tier is more
than enough for a team tracker.

### 1. Create a Firebase project
1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. Name it anything (e.g. `idfy-project-tracker`). Google Analytics is optional — you can skip it.

### 2. Enable Google sign-in
1. In the console: **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Google**. Pick a support email and save.
3. Under **Settings → Authorized domains**, add your GitHub Pages domain, e.g. `ankurkatyarmal.github.io`.

### 3. Create the Firestore database
1. **Build → Firestore Database → Create database**.
2. Start in **production mode** (we'll paste in our own rules next).
3. Pick any region close to your users.
4. Once created, go to the **Rules** tab and replace the contents with the
   file `firestore.rules` included in this project. Click **Publish**.

### 4. Get your web app config
1. Project Settings (gear icon) → scroll to **Your apps** → click the **</>** (web) icon.
2. Register the app (nickname doesn't matter, skip Hosting).
3. Copy the `firebaseConfig` object shown.
4. Paste those values into `js/firebase-config.js` in this project, replacing
   the `YOUR_...` placeholders. Nothing else in that file needs to change —
   the app detects real config automatically and switches to Cloud mode.

### 5. Make yourself the first admin
There's a bootstrap step because the very first user has no one to approve
them — this is handled automatically via an email allow-list, **but you must
set it in two places before you deploy**:

1. Open `js/firebase-config.js` and put your own Google account email into
   `ADMIN_EMAILS`:
   ```js
   var ADMIN_EMAILS = ["you@yourcompany.com"];
   ```
2. Open `firestore.rules` and put the **exact same email** into the
   `isBootstrapAdminEmail()` function:
   ```
   return request.auth.token.email in ['you@yourcompany.com'];
   ```
   Re-publish the rules in the Firebase console after editing.
3. Deploy the site (or open `index.html` locally) with both files updated.
4. Sign in with that Google account — you're approved as Admin instantly,
   no manual Firestore editing needed.

Only emails in this list get auto-approved. Everyone else who signs in — including
someone who edits their own `js/firebase-config.js` copy — always lands in
"pending," because the *security rules* (not just the app code) enforce this
server-side. You can add more admins later by approving someone as Admin
from the Access Requests page.

From then on, everyone else who signs in lands in **Access Requests** (in
your sidebar) for you to approve as:
- **Editor** — full add/edit/delete on projects and activities
- **Viewer** — read-only, can't download reports or export data
- **Viewer + Download** — read-only, but can generate/download reports and export JSON

> **On notifications:** the admin sees a live badge on "Access Requests"
> while the app is open, and it updates without a refresh. True push or
> email notifications (so you'd be notified even with the app closed) need
> a Firebase Cloud Function + an email service (e.g. SendGrid) on Firebase's
> paid Blaze plan — happy to wire that up as a follow-up if you want it.

---

## Dark theme

Click the 🌙 icon in the top bar, or Settings → **Toggle dark mode**. The
choice is remembered per-browser.

---

## Importing data

Settings → **Download import template** gives you the exact JSON shape
expected. In short, import expects a JSON **array** of project objects:

```json
[
  {
    "client": "Example Client Ltd",
    "projectName": "Example Privy Rollout",
    "projectType": "POC",
    "environment": "Cloud",
    "cloudProvider": "GCP",
    "infrastructureOwnership": "Client",
    "owner": "Your Name",
    "startDate": "2026-08-01",
    "targetDate": "2026-10-01",
    "status": "planned",
    "health": "ON TRACK",
    "modules": ["CGP", "DPRM"],
    "description": "One-line description of the engagement.",
    "activities": [
      {
        "date": "2026-08-01",
        "activityType": "MEETING",
        "description": "Kickoff call",
        "ownerType": "PROJECT / PM",
        "owner": "Your Name",
        "dependencySide": "Internal",
        "requestedDate": "",
        "expectedDate": "",
        "receivedDate": "",
        "status": "COMPLETED"
      }
    ]
  }
]
```

Required per project: `client`, `projectName`, `projectType` (`POC`/`LIVE`),
`status` (one of `backlog`/`planned`/`in-progress`/`blocked`/`uat`/`completed`),
`health` (`ON TRACK`/`AT RISK`/`DELAYED`/`BLOCKED`). Everything else is
optional — `id` and activity `id`s are auto-generated if missing. Bad or
missing fields are reported with a specific error message (which project,
which field) rather than failing silently. **Importing replaces your current
dataset**, so export first if you want a backup.

---

## Reports

**Reports** page in the sidebar (needs Viewer+Download, Editor, or Admin access):

- **Project Report** — pick a project, get a full one-page delivery report:
  info, current dependency, waiting-time analytics, complete activity timeline.
- **Weekly Status Update** — pick a date range, get a portfolio-wide summary:
  status/health table for every project, all activity logged in that window,
  and a currently-blocked list.

Both open in a new tab styled for print. Click **Print / Save as PDF** and
choose "Save as PDF" as the destination in your browser's print dialog — no
extra software needed.

---

## File structure

```
index.html
firestore.rules            Firestore security rules (paste into Firebase console)
css/
    styles.css              Design system incl. dark theme
js/
    firebase-config.js      Your Firebase project keys (edit this)
    auth.js                 Google sign-in, approval workflow, role management
    storage.js              localStorage (local mode) / Firestore (cloud mode)
    data.js                 constants, date helpers, waiting/duration calculations, sample data
    kanban.js               Kanban board rendering + drag-and-drop
    timeline.js             per-project vertical timeline + global timeline table
    analytics.js            Analytics page
    reports.js              Project report + weekly status report (print/PDF)
    app.js                  application controller: state, navigation, modals, CRUD, permissions
```

## Core concepts

- **Status** vs **Health** are independent. Status is the Kanban column.
  Health is a risk signal (On Track / At Risk / Delayed / Blocked).
- **Waiting** means something was requested and a response is pending.
  **Blocked** means work can't proceed even though nothing is formally
  outstanding.
- Waiting days for an unresolved request = today − requested date. Once a
  `Received Date` is filled in, it locks in as received date − requested date.

## Roles and what they can do

| | Admin | Editor | Viewer + Download | Viewer |
|---|---|---|---|---|
| View everything | ✅ | ✅ | ✅ | ✅ |
| Add/edit/delete projects & activities | ✅ | ✅ | ❌ | ❌ |
| Drag cards on Kanban | ✅ | ✅ | ❌ | ❌ |
| Download reports / export JSON | ✅ | ✅ | ✅ | ❌ |
| Import JSON | ✅ | ✅ | ❌ | ❌ |
| Approve/reject access requests | ✅ | ❌ | ❌ | ❌ |
| Reset to sample data / clear all data | ✅ | ❌ | ❌ | ❌ |

In local mode (no Firebase configured), everyone has full Admin-level access
since there's no login.
