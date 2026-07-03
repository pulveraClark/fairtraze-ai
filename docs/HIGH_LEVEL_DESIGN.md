# FairTraze AI — High-Level Design

Screen and modal inventory with UI elements, data, navigation, and access control.

---

## Contents

1. [Module 1 — Landing / Auth](#module-1--landing--auth)
2. [Module 2 — Instructor](#module-2--instructor)
3. [Module 3 — Admin](#module-3--admin)
4. [Module 4 — Student](#module-4--student)
5. [Module 5 — Shared](#module-5--shared)
6. [Modals / Panels](#modals--panels)

---

## Module 1 — Landing / Auth

### Screen 1 — Landing Page
**Route:** `/` · **File:** `client/src/pages/LandingPage.tsx` · **Access:** Public

| Section | Items |
|---|---|
| Nav bar | Logo (→ `/`); "Sign In" button (→ `/login`); "Get Started" button (→ `/register`); "Go to Dashboard" + UserMenu (authenticated users only) |
| Hero | Headline; tagline; dual CTA buttons mirroring nav actions |
| Product preview | Static mockup: team health badge, contribution bars per member, flag chips (free-rider / overload), AI narrative panel |
| How it works | 3-step cards: Connect · Score Automatically · Get Report |
| Data sources | GitHub card (status: Implemented); FairTraze Docs card (status: In Development) |
| Core principle banner | "The math scores. The AI explains." |
| Footer | Link → `/overview` |

| Logic | Detail |
|---|---|
| Auth check | Reads `user` + `authLoading` from `AuthContext` |
| Role-based redirect | "Go to Dashboard" links to `/student`, `/dashboard`, or `/admin` based on role |
| Flash prevention | No CTA rendered while `authLoading === true` |

---

### Screen 2 — Sign In
**Route:** `/login` · **File:** `client/src/pages/LoginPage.tsx` · **Access:** Public (redirects if already authenticated)

| Section | Items |
|---|---|
| Left panel (desktop) | Gradient background; wordmark; illustration (contribution dashboard); tagline |
| Right panel | Email input; password input; error alert (conditional); "Sign In" submit button; "Register" link (→ `/register`) |
| Top-left | Back button (→ `/`) |

| Logic | Detail |
|---|---|
| Form state | `email`, `password`, `error`, `submitting` |
| Submit | Calls `login(email, password)` via `AuthContext`; checks `localStorage.ft_next` for post-login redirect |
| Role-based redirect | → `/student`, `/admin`, or `/dashboard` |
| Submit disabled | While `submitting === true` or any field empty |

---

### Screen 3 — Create Account
**Route:** `/register` · **File:** `client/src/pages/RegisterPage.tsx` · **Access:** Public

| Section | Items |
|---|---|
| Left panel (desktop) | Gradient background; wordmark; illustration (data-source diagram); copy |
| Right panel | Name input; email input; role select (`INSTRUCTOR` / `STUDENT`); password input (min 8 chars note); error alert (conditional); "Create Account" submit button; "Sign in" link (→ `/login`) |
| Top-left | Back button (→ `/`) |

| Logic | Detail |
|---|---|
| Form state | `name`, `email`, `role`, `password`, `error`, `submitting` |
| Validation | Password ≥ 8 characters; all fields required |
| Submit | Calls `register(email, password, name, role)` via `AuthContext` |
| Role-based redirect | → `/student`, `/dashboard`, or `/admin` |

---

### Screen 4 — System Overview
**Route:** `/overview` · **File:** `client/src/pages/OverviewPage.tsx` → `client/src/components/SystemOverview.tsx` · **Access:** Public

| Section | Items |
|---|---|
| Page header | "System Overview" title + description |
| 1. What it is | Description; core principle callout (⚖ icon) |
| 2. Data sources | GitHub card (✓ Implemented); FairTraze Docs card (Planned); combined scoring formula |
| 3. System roles | 3 cards: Instructor · Student · Admin (each with capability bullet list) |
| 4. Lifecycle | 5-step numbered flow: Instructor creates class → Students join → Leaders connect repo → Members self-register → Instructor analyzes |
| 5. GitHub analysis & scoring | 5-step pipeline; contribution formula; 4 participation flags; Gini coefficient health table |
| 6. Group roles | Leader (admin flag) · Developer · Documentation Lead — each with implementation status badge |
| 7. Explainable AI | Green "What it does" box; red "What it does NOT do" box |
| 8. Fairness tools | Explainable report · Export/Print · At-risk alerts · Dispute workflow |
| 9. Privacy, Oversight & Student Agency | 3-card grid |
| 10. What's Next | FairTraze Collaborative Editor + Combined Scoring (Planned) |
| Legend bar | Status badge legend |
| Footer disclaimer | Outputs support instructor judgment; never replace it |

| Logic | Detail |
|---|---|
| Status badges | "✓ Implemented" (emerald) vs "Planned — next build" (amber) |
| Data | Fully hardcoded; no API calls |

---

## Module 2 — Instructor

### Screen 5 — Instructor Dashboard
**Route:** `/dashboard` · **File:** `client/src/pages/DemoPage.tsx` · **Access:** INSTRUCTOR, ADMIN

| Section | Items |
|---|---|
| Page header | "Instructor Dashboard" title; at-risk alert badge (count, conditional); "New Class Section" button (→ M1) |
| Search bar | Free-text search (filters by subject code or group name) |
| Sort / filter bar | Sort: By Risk · By Name; Filter: All Classes · At-risk Only |
| Main — default mode | Grid of `ClassCard` (3 cols lg / 2 cols md / 1 col mobile); each card: subject code, subject name, course, EDP code, join code, assignment count, health summary, group count |
| Main — at-risk mode | Grid of `GroupSummaryCard` for flagged groups only |
| Main — search mode | Subjects list + Groups list |
| Empty state | "No classes yet" message + CTA |
| Footer | Disclaimer + link → `/overview` |

| Logic | Detail |
|---|---|
| State | `classes`, `summary`, `sortMode`, `filterMode`, `searchQuery`, `analyzing` (Set), `showClassModal`, `deleteTarget` |
| APIs | `GET /api/classes`; `GET /api/projects/summary`; `POST /api/projects/:id/analyze`; `DELETE /api/classes/:id`; `POST /api/classes` (via M1) |
| Navigation | `ClassCard` click → `/class/:classId`; `GroupSummaryCard` click → `/project/:projectId` |
| Modals | M1 Create Class Section; M2 Delete Class Section |

---

### Screen 6 — Class Section View
**Route:** `/class/:classId` · **File:** `client/src/pages/ClassPage.tsx` · **Access:** INSTRUCTOR, ADMIN

| Section | Items |
|---|---|
| Page header | Gradient band; class title (`subjectCode — subjectName`); edit icon; delete icon |
| Breadcrumb | Dashboard → ClassName |
| Per-assignment section | Assignment title; deadline; source type badge; risk pill (High Risk / Moderate / Healthy / Not analyzed); "New Group" button |
| Group cards | Grid of `GroupSummaryCard`: group name, member count, health badge, re-analyze button, manage button |
| Sort / filter | Sort: By Risk · By Name; Filter: All · At-risk Only; search |
| Footer | Disclaimer + link → `/overview` |

| Logic | Detail |
|---|---|
| State | `classInfo`, `assignments`, `summary`, `sortMode`, `filterMode`, `searchQuery`, `analyzing` (Set), `managingGroupId` |
| APIs | `GET /api/classes/:classId`; `GET /api/projects/summary`; `POST /api/projects/:id/analyze` |
| Navigation | Back → `/dashboard` or `/admin`; `GroupSummaryCard` → `/project/:projectId`; Manage button → opens M6 |
| Modals | M3 Create Assignment; M4 Delete Assignment; M6 Group Manage |

---

### Screen 7 — Assignment / Groups View
**Route:** `/class/:classId/assignment/:assignmentId` · **File:** `client/src/pages/AssignmentPage.tsx` · **Access:** INSTRUCTOR, ADMIN

| Section | Items |
|---|---|
| Breadcrumb | Dashboard → ClassName → AssignmentTitle |
| Assignment details bar | Title; deadline; max group size; source type |
| Group cards | Grid of `GroupSummaryCard`: same as Screen 6 per-group view |
| Sort / filter | Same controls as Screen 6 |
| Access guard | 403 message if user is not INSTRUCTOR or ADMIN |

| Logic | Detail |
|---|---|
| State | `assignment`, `classInfo`, `summary`, `sortMode`, `filterMode`, `search`, `analyzing`, `managingGroupId` |
| APIs | `GET /api/assignments/:assignmentId`; `GET /api/classes/:classId/assignments`; `GET /api/projects/summary`; `POST /api/projects/:id/analyze` |
| Navigation | Back → class page; `GroupSummaryCard` → `/project/:projectId`; Manage → opens M6 |
| Modals | M6 Group Manage |

---

### Screen 8 — Project Analysis (Group Report)
**Route:** `/project/:id` · **File:** `client/src/pages/ProjectDetailPage.tsx` · **Access:** INSTRUCTOR, ADMIN (full); STUDENT (limited read-only)

| Section | Items |
|---|---|
| Page header | Breadcrumb; group title; team health badge |
| Group switcher | Dropdown to navigate between sibling groups in the same assignment |
| Tabs | "Report" · "Document" (FairTraze Docs — planned) |
| **Report tab** | |
| — Team health banner | `Healthy` / `Moderate Risk` / `High Risk` with Gini coefficient |
| — Contribution chart | Bar chart: each member's contribution share (%) |
| — Member table | Columns: Member · Share · Commits · Lines · Active Days · Flags · Dispute indicator; each flag rendered as a colored chip |
| — AI narrative | Full Gemini-generated plain-language explanation (accordion or scroll) |
| — Instructor controls | "Run Analysis" button; "Scoring Settings" button (→ M5); "Export PDF" button; "Print" button |
| Stale config warning | Banner: "Config changed since last analysis — re-run to apply" (conditional) |
| Analysis stepper | Step-by-step progress overlay during re-analysis |
| **Document tab** | `FairTrazeDocsPreview` placeholder (Phase D) |

| Logic | Detail |
|---|---|
| State | `stored` (full report), `narrativeText`, `projectMeta`, `siblings`, `reanalyzing`, `showScoringModal`, `configStale`, `disputedMembers` (Set), `resolvedFlagOutcomes` (Map) |
| APIs | `GET /api/projects/:id/report`; `GET /api/projects/summary`; `GET /api/projects/:id/disputes` (instructor only); `POST /api/projects/:id/analyze`; `PATCH /api/projects/:id/config` |
| Navigation | Group switcher → `/project/:siblingId`; Breadcrumb → class/assignment |
| Conditional | Students: disputes section hidden; Scoring Settings hidden; Stale config warning shows if `configStale === true`; Disputed badge on member row if member in `disputedMembers`; resolved/dismissed outcome badge if dispute is closed |
| Modals | M5 Scoring Settings |

---

### Screen 9 — Alerts
**Route:** `/alerts` · **File:** `client/src/pages/AlertsPage.tsx` · **Access:** INSTRUCTOR, ADMIN, STUDENT

| Section | Items |
|---|---|
| Page header | "Alerts" title; unread count badge; "Mark all as read" button (conditional) |
| Alert list | Per row: type badge (AT-RISK, etc.); message text; time-ago; unread dot (conditional); clickable row |
| Pagination | Bar with page navigation |
| Empty state | Checkmark icon + "No alerts" message |
| Loading state | Spinner |
| Error state | Error message + "Retry" button |

| Logic | Detail |
|---|---|
| State | `alerts`, `unreadCount`, `page`, `meta`, `loading`, `error` |
| APIs | `GET /api/alerts?page=&pageSize=20`; `POST /api/alerts/:id/read`; `POST /api/alerts/read-all` |
| Navigation | Alert row click → disputes page or project detail (type-dependent) |
| Conditional | "Mark all as read" only visible if `unreadCount > 0`; unread dot only if `alert.read === false` |

---

### Screen 10 — Disputes
**Route:** `/disputes` · **File:** `client/src/pages/DisputesPage.tsx` · **Access:** INSTRUCTOR, ADMIN

| Section | Items |
|---|---|
| Page header | "Disputes" title; class filter dropdown; status filter (Open / All) |
| Dispute list | Per row: student name; context (group, assignment, class); status badge (OPEN / RESOLVED / DISMISSED); disputed flag chips; created timestamp; "Respond" button (OPEN only) |
| Pagination | Standard pagination bar |
| Empty / loading / error | Standard states |
| Footer | Disclaimer |

| Logic | Detail |
|---|---|
| State | `disputes`, `page`, `meta`, `classFilter`, `statusFilter`, `loading`, `error`, `showingModal` |
| APIs | `GET /api/disputes?page=&...filters`; `POST /api/disputes/:id/resolve` (via M12) |
| Conditional | "Respond" button only if `status === "OPEN"` and user is INSTRUCTOR/ADMIN |
| Modals | M12 Respond & Resolve Dispute |

---

## Module 3 — Admin

### Screen 11 — Admin Panel
**Route:** `/admin` · **File:** `client/src/pages/AdminPage.tsx` · **Access:** ADMIN only

| Section | Items |
|---|---|
| Overview stats | Total users; breakdown by role (Admin / Instructor / Student); class section count; total groups; health distribution bar chart; flag totals; open disputes count |
| At-risk groups | Compact list (group name, class, health badge); each row links to project detail |
| User management | Search input; role filter dropdown; user table (Name · Email · Role dropdown · GitHub username · Status · Created date); pagination |
| Audit Log link | Button / link → `/admin/audit` |
| Toast notifications | Top-right: success / error (auto-dismiss after 4 s) |
| Hierarchy stubs | Browse Classes, Departments — rendered as disabled placeholder buttons |

| Logic | Detail |
|---|---|
| State | `displayedUsers`, `search`, `roleFilter`, `usersPage`, `usersLoading`, `usersError`, `usersMeta`, `overview`, `toast` |
| APIs | `GET /api/admin/users?page=&search=&role=`; `PATCH /api/admin/users/:userId/role`; `GET /api/admin/overview`; `GET /api/admin/at-risk-groups` |
| Navigation | At-risk group row → `/project/:projectId`; Audit Log → `/admin/audit` |
| Conditional | Role dropdown triggers confirmation before applying; toast auto-hides; overview stats gated on data load |

---

### Screen 12 — Audit Log
**Route:** `/admin/audit` · **File:** `client/src/pages/AuditLogPage.tsx` · **Access:** ADMIN only

| Section | Items |
|---|---|
| Page header | Breadcrumb (Admin › Audit Log); action filter dropdown; "Refresh" button |
| Audit table | Columns: Action (colored badge) · Actor · Target · Details (hidden sm) · When (timestamp) |
| Pagination | Standard bar |
| Empty / loading / error | Standard states |

| Logic | Detail |
|---|---|
| State | `entries`, `action` (filter), `page`, `meta`, `loading`, `error` |
| APIs | `GET /api/admin/audit?page=&action=` |
| Navigation | Breadcrumb → `/admin` |
| Conditional | Details column hidden on small screens; badge colors from `ACTION_BADGE` map |

---

## Module 4 — Student

### Screen 13 — Student Dashboard
**Route:** `/student` · **File:** `client/src/pages/StudentPage.tsx` · **Access:** STUDENT only

| Section | Items |
|---|---|
| Page header | "My Classes" title; "Join a Class" button (→ M7) |
| Enrolled classes grid | Per card: subject code + name; course + EDP code; join code (copyable badge); assignments list with create/join group options; health badges per assignment |
| Empty state | "No classes yet" + "Join a Class" CTA |
| Footer | Disclaimer |

| Logic | Detail |
|---|---|
| State | `enrolledClasses`, `loading`, `loadError`, `showJoinModal`, `user` |
| APIs | `GET /api/students/my-classes`; `POST /api/join/class` (via M7) |
| Navigation | Class card → `/student/class/:classId`; Assignment link → `/student/assignment/:assignmentId` |
| Modals | M7 Join a Class |

---

### Screen 14 — Student Class View
**Route:** `/student/class/:classId` · **File:** `client/src/pages/StudentClassPage.tsx` · **Access:** STUDENT only

| Section | Items |
|---|---|
| Page header | Class title (`subjectCode — subjectName`); join code badge |
| Per-assignment tabs | Assignment title; deadline; source type |
| If in a group | `GroupCard`: group name, member list, health badge, "View Report" button, "Manage Group" button |
| If request pending | `PendingRequestCard`: group name, request status badge |
| If no group | "Create Group" form (group name + repo URL) or "Join Group" section (lists existing groups with "Request to Join" buttons) |
| Footer | Disclaimer |

| Logic | Detail |
|---|---|
| State | `classDetail`, `loading`, `loadError`, `managingGroupId`, create/join form states |
| APIs | `GET /api/students/class/:classId`; `POST /api/join/create-group`; `POST /api/join/request-group` |
| Navigation | Back → `/student`; "View Report" → `/student/group/:projectId`; "Manage Group" → opens M6 |
| Modals | M6 Group Manage; M8 Leave Class confirmation |

---

### Screen 15 — Student Group View
**Route:** `/student/group/:projectId` · **File:** `client/src/pages/StudentGroupPage.tsx` · **Access:** STUDENT only

| Section | Items |
|---|---|
| Page header | Group title; team health badge |
| Tabs | "Report" · "Document" (FairTraze Docs — Phase D) |
| **Report tab** | |
| — Team health | Health label; Gini coefficient |
| — My contribution | Contribution share (%); breakdown: commits, additions, deletions, active days |
| — My flags | Colored flag pills with plain-language descriptions |
| — Team distribution bar | Visual bar: all members' shares, current user highlighted in indigo |
| — Dispute section | "Flag for Review" button (if flag present, no open dispute); status badge (OPEN); "Your note" + "Awaiting response" (if OPEN); "Instructor's response" (if RESOLVED / DISMISSED) |
| — Role management | Pending role suggestion: Accept / Decline buttons (if suggestion exists and not yet accepted) |
| Leave group button | Triggers M8 confirmation |
| **Document tab** | `FairTrazeDocsPreview` (Phase D placeholder) |

| Logic | Detail |
|---|---|
| State | `groupDetail`, `managingGroupId`, `showDisputeModal`, `dispute`, `activeTab` |
| APIs | `GET /api/groups/:id/detail`; `GET /api/groups/:id/role-suggestion`; `POST /api/disputes`; `POST /api/groups/:id/accept-role`; leave-group endpoint |
| Navigation | Back → `/student/class/:classId`; "Manage Group" → opens M6 |
| Conditional | Report section only if `hasReport === true`; dispute section state-machine (no dispute → button; OPEN → status + note; closed → outcome + instructor response); role suggestion panel only if suggestion exists and status ≠ ACCEPTED |
| Modals | M11 Flag for Review; M8 Leave Group confirmation |

---

## Module 5 — Shared

### Screen 16 — Profile & Settings
**Route:** `/settings` · **File:** `client/src/pages/SettingsPage.tsx` · **Access:** All authenticated roles

| Section | Items |
|---|---|
| Page header | "Settings" title |
| Profile card | Name (read-only); email (read-only); role badge; GitHub username (read-only; students can edit via M9); account created date |
| Action buttons | "Edit Profile" (→ M9); "Change Password" (→ M10); "Logout" |
| Banners | Success / error (auto-dismiss) |
| Footer | Disclaimer |

| Logic | Detail |
|---|---|
| State | `profile`, `successMessage`, `errorMessage`, `showEditModal`, `showPasswordModal` |
| APIs | `GET /api/users/me`; `PATCH /api/users/me` (via M9); `POST /api/users/me/change-password` (via M10); `POST /api/auth/logout` |
| Navigation | Logout → `/` |
| Modals | M9 Edit Profile; M10 Change Password |

---

## Modals / Panels

### M1 — Create Class Section
**Parent:** Screen 5 (Instructor Dashboard) · **File:** inline `DemoPage.tsx`

| Items | Detail |
|---|---|
| Form fields | Subject code; subject name; course; EDP code; section type |
| On success | Shows generated join code; closes modal and refetches class list |
| API | `POST /api/classes` |

---

### M2 — Delete Class Section (Confirm)
**Parent:** Screen 5 (Instructor Dashboard) · **File:** inline `DemoPage.tsx`

| Items | Detail |
|---|---|
| UI | ConfirmDialog: type the class name to confirm; "Delete" button (destructive red) |
| API | `DELETE /api/classes/:classId` |
| On confirm | Deletes class and all child data; redirects or refetches |

---

### M3 — Create Assignment
**Parent:** Screen 6 (Class Section View) · **File:** inline `ClassPage.tsx`

| Items | Detail |
|---|---|
| Form fields | Assignment title; deadline (date picker); max group size; source type (GITHUB / EDITOR / COMBINED) |
| API | `POST /api/assignments` (with `classId`) |

---

### M4 — Delete Assignment (Confirm)
**Parent:** Screen 6 (Class Section View) · **File:** inline `ClassPage.tsx`

| Items | Detail |
|---|---|
| UI | ConfirmDialog: type-to-confirm pattern |
| API | `DELETE /api/assignments/:assignmentId` |

---

### M5 — Scoring Settings
**Parent:** Screen 8 (Project Analysis) · **File:** `client/src/components/ScoringSettingsModal.tsx`

| Section | Items |
|---|---|
| Contribution weights | 3 slider rows: Commits · Lines (meaningful) · Active days; each row: label, description, %, input field; sum indicator badge (green ✓ if = 1.0, red ✕ otherwise) |
| Flag thresholds | 3 slider rows: Free-rider threshold · Overload threshold · Deadline-driven threshold; each row: description + input field |
| Actions | "Reset to defaults"; "Save"; "Cancel" |

| Logic | Detail |
|---|---|
| State | `commits`, `lines`, `activeDays`, `freeRider`, `overload`, `deadlineDriven`, `saving`, `saveError` |
| API | `PATCH /api/projects/:id/config` |
| Conditional | Save disabled if weights do not sum to 1.0 |

---

### M6 — Group Manage
**Parent:** Screens 6, 7, 14, 15 · **File:** `client/src/components/GroupManageModal.tsx`

| Section | Items |
|---|---|
| Members list | Per member: initials avatar; name; email; GitHub username; leader badge (conditional); functional role toggles (Developer / Documentation — instructor/leader only); action menu (Reassign Leader / Remove Member — instructor/leader only) |
| Join requests | Per request: member name, email, GitHub username; Accept / Decline buttons (leader/instructor only) |
| Role suggestions | Per suggestion: member name; suggested role label; Accept / Decline buttons (leader/instructor only) |
| Danger zone | "Disband group" button (instructor only); type-to-confirm before executing |

| Logic | Detail |
|---|---|
| State | `group`, `requests`, `roleSuggestions`, `step` (list / reassign-select / confirm-reassign / confirm-remove / confirm-disband), `loading`, `fetchErr`, `actionErr` |
| APIs | `GET /api/groups/:id`; `GET /api/groups/:id/requests`; `GET /api/groups/:id/role-suggestions`; `POST /api/groups/:id/reassign-leader`; `POST /api/groups/:id/accept-request`; `POST /api/groups/:id/decline-request`; `POST /api/groups/:id/accept-role-suggestion`; `POST /api/groups/:id/decline-role-suggestion`; `PATCH /api/groups/:id/members/:userId/roles`; `POST /api/groups/:id/remove-member`; `POST /api/groups/:id/disband` |
| Conditional | Requests + Role Suggestions + Danger Zone: visible to leader/instructor only; Functional role toggles: editable by leader/instructor only; Student view: own membership info read-only only |

---

### M7 — Join a Class
**Parent:** Screen 13 (Student Dashboard) · **File:** inline `StudentPage.tsx`

| Items | Detail |
|---|---|
| UI | Single text input for join code; "Join" button |
| On success | Shows class name confirmation; closes modal; refetches enrolled classes |
| API | `POST /api/join/class` |

---

### M8 — Leave Class / Leave Group (Inline Confirm)
**Parent:** Screens 14, 15 · **File:** inline `StudentClassPage.tsx` / `StudentGroupPage.tsx`

| Items | Detail |
|---|---|
| UI | Inline confirmation dialog: "Are you sure you want to leave this group?" with "Confirm" and "Cancel" buttons |
| API | Leave-group endpoint (removes student's `GroupMembership`) |

---

### M9 — Edit Profile
**Parent:** Screen 16 (Profile & Settings) · **File:** inline `SettingsPage.tsx`

| Items | Detail |
|---|---|
| Form fields | Name (all roles); GitHub username (students only — input shown; instructors/admins: read-only) |
| Validation | Name required |
| API | `PATCH /api/users/me` |
| On success | Success banner; closes modal; refetches profile |

---

### M10 — Change Password
**Parent:** Screen 16 (Profile & Settings) · **File:** inline `SettingsPage.tsx`

| Items | Detail |
|---|---|
| Form fields | Current password; new password; confirm new password |
| Validation | New password ≥ 8 chars; confirm must match |
| API | `POST /api/users/me/change-password` |
| On success | Success banner; closes modal |

---

### M11 — Flag for Review / Dispute
**Parent:** Screen 15 (Student Group View) · **File:** inline `StudentGroupPage.tsx`

| Items | Detail |
|---|---|
| UI — submit state | Free-text reason textarea; "Submit" + "Cancel" buttons |
| UI — OPEN state | Status badge; "Your note: …"; "Awaiting instructor response" label |
| UI — resolved state | Status badge (RESOLVED / DISMISSED); "Instructor's response: …" |
| API | `POST /api/disputes` (submit) |
| Conditional | Which state renders depends on `dispute.status` (null / OPEN / RESOLVED / DISMISSED) |

---

### M12 — Respond & Resolve Dispute
**Parent:** Screen 10 (Disputes) · **File:** inline `DisputesPage.tsx`

| Items | Detail |
|---|---|
| UI | Student's submitted note (read-only); outcome radio buttons (RESOLVED / DISMISSED); instructor response textarea; "Submit" + "Cancel" |
| API | `POST /api/disputes/:disputeId/resolve` |
| Access | INSTRUCTOR / ADMIN only |

---

## Quick Reference

### Screen-to-route map

| # | Screen | Route |
|---|---|---|
| 1 | Landing Page | `/` |
| 2 | Sign In | `/login` |
| 3 | Create Account | `/register` |
| 4 | System Overview | `/overview` |
| 5 | Instructor Dashboard | `/dashboard` |
| 6 | Class Section View | `/class/:classId` |
| 7 | Assignment / Groups View | `/class/:classId/assignment/:assignmentId` |
| 8 | Project Analysis | `/project/:id` |
| 9 | Alerts | `/alerts` |
| 10 | Disputes | `/disputes` |
| 11 | Admin Panel | `/admin` |
| 12 | Audit Log | `/admin/audit` |
| 13 | Student Dashboard | `/student` |
| 14 | Student Class View | `/student/class/:classId` |
| 15 | Student Group View | `/student/group/:projectId` |
| 16 | Profile & Settings | `/settings` |

### Modal-to-parent map

| # | Modal | Parent screen(s) |
|---|---|---|
| M1 | Create Class Section | 5 |
| M2 | Delete Class Section | 5 |
| M3 | Create Assignment | 6 |
| M4 | Delete Assignment | 6 |
| M5 | Scoring Settings | 8 |
| M6 | Group Manage | 6, 7, 14, 15 |
| M7 | Join a Class | 13 |
| M8 | Leave Class / Group (confirm) | 14, 15 |
| M9 | Edit Profile | 16 |
| M10 | Change Password | 16 |
| M11 | Flag for Review / Dispute | 15 |
| M12 | Respond & Resolve Dispute | 10 |

### Access control summary

| Screen(s) | Roles |
|---|---|
| 1, 2, 3, 4 | Public |
| 5, 6, 7, 8, 9, 10 | INSTRUCTOR, ADMIN |
| 8 (read-only) | STUDENT (own group report only) |
| 11, 12 | ADMIN only |
| 13, 14, 15 | STUDENT only |
| 16 | All authenticated |
