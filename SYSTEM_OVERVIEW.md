# FAIR TRAZE AI — System Overview

> **How to read this document.** Throughout, features are clearly labelled:
> - **Working now** — built, tested, and running in the current codebase.
> - **Coming next** — designed and planned but not yet built.

---

## What Is FAIR TRAZE AI?

FAIR TRAZE AI helps instructors fairly assess each individual's contribution in a student group project. It gathers digital traces of collaboration — currently from GitHub — scores each member's contribution deterministically using transparent math, detects participation problems (free-riding, overload, deadline-driven work), and produces a plain-language fairness report that instructors can act on.

**The core principle: the math scores, the AI explains.**

Every number in the system — contribution shares, flags, Gini coefficients, team health labels — is calculated deterministically by code. The AI (Google Gemini) reads those already-computed numbers and writes a plain-language explanation of them. The AI never invents, changes, or overrides a number, and it never assigns grades. This separation is intentional and fundamental to the system's fairness and defensibility.

**What problem does it solve?**

Traditional group assignments grade the group, not the individual. It is difficult for an instructor to know who actually did the work versus who free-rode on their teammates' effort, especially in large classes with many groups. FAIR TRAZE AI makes hidden contribution patterns visible by analysing the digital traces that already exist — commit history, line changes, activity rhythms — and presenting them in a structured, explainable report. The instructor still makes the final judgment; the system gives them evidence.

---

## The Three Roles

### Instructor

**Working now:**
- Creates class sections and assignments
- Manages groups (overrides roles, reassigns leaders, removes members)
- Triggers GitHub contribution analysis for any group
- Views the full fairness report including contribution scores, flags, Gini coefficient, team health, and the AI narrative
- Receives in-app alerts when groups are flagged as at-risk
- Reviews and resolves student disputes with a written response
- Configures scoring settings per project (weights, flag thresholds)
- Exports and prints reports

### Student

**Working now:**
- Enrolls in a class using the instructor's join code
- Requests to join a group (leader approves or declines)
- Views their own group's fairness report (read-only)
- Sees their own contribution share and any flags applied to them
- Files a dispute if they believe their contribution was not accurately captured
- Suggests a functional role for themselves (leader approves)
- If they are the group leader: approves join requests from other students, assigns roles to members, and manages the group roster

### Admin

**Working now:**
- Views all users across the institution
- Changes any user's system role (Admin, Instructor, Student)
- Activates or deactivates accounts
- Deletes users
- Views an institution-wide overview: total users, classes, groups, health distribution, open disputes, at-risk groups
- Browses the audit log to see what administrative actions have been taken and by whom

---

## How It Works: The Full Lifecycle

### Step 1 — Instructor sets up a class

**Working now:** The instructor creates a class section (subject code, subject name, course, class type). The system automatically generates a unique join code for that class. The instructor shares this code with students.

### Step 2 — Students enroll in the class

**Working now:** Students register an account and enter the class join code. The system records their enrollment. Students can see the class and its assignments on their dashboard.

### Step 3 — Instructor creates an assignment

**Working now:** Inside the class, the instructor creates one or more assignments. Each assignment has a title, optional deadline, optional maximum group size, and a source type (currently GitHub). The system generates a separate join code for each assignment, which students use to form or join groups under that assignment.

### Step 4 — Students form groups

**Working now:** Any enrolled student can request to join an existing group for an assignment. The group's leader receives the request and approves or declines it. The first student to create a group for a given assignment becomes that group's leader. Joining requires the student to have a GitHub username set on their account profile (for GitHub assignments), and the group must not be full.

If a student's request is declined, they can request to join a different group. If a request is pending, they can see its status on their dashboard.

### Step 5 — Instructor triggers analysis

**Working now:** Once a group has members and a linked GitHub repository, the instructor clicks "Analyse" on the group's page. The system fetches each member's GitHub activity (commits, line changes, active days), classifies and weights each contribution, runs the deterministic scoring formulas, generates a Gini coefficient and team health label, and then asks Gemini to write a plain-language explanation. The report is saved to the database.

### Step 6 — Instructor reviews the report

**Working now:** The report page shows:
- The team health label (Healthy, Moderate Risk, or High Risk)
- The Gini coefficient (a measure of contribution inequality)
- Each member's contribution share as a percentage and a bar chart
- Any flags applied to members (inactive, free-rider, overload, deadline-driven)
- A detailed metrics table (commits, meaningful lines, active days, weighted scores)
- The AI-generated narrative explaining the patterns in plain language
- Any open or resolved student disputes related to this group

### Step 7 — Student views their own report

**Working now:** Students see a read-only version of the report for their own group. They can see the team's overall health, their own contribution share, and any flags applied to them. They cannot see other members' individual data.

### Step 8 — Student disputes a flag (optional)

**Working now:** If a flagged student believes their contribution was not fully captured — for example, because they did significant offline coordination, verbal design work, or manual testing — they can file a dispute with a written explanation. The instructor receives an in-app alert. The instructor can then mark the dispute as Resolved or Dismissed and write a response. The student sees the instructor's response on their group page.

---

## GitHub Analysis (Working Now)

This is the current core of the system. When analysis is triggered for a group, the server fetches each member's GitHub activity via the GitHub API and runs the following pipeline.

### What is collected

For each member, the system collects:
- Number of commits
- Lines added and deleted
- Commit timestamps (to calculate active days and detect deadline-driven work)
- Per-commit diffs (to classify added lines as code, comments, or blank lines)

Up to 50 commits per member are sampled for the diff analysis.

### Meaningful lines

Not all added lines carry equal weight. The system classifies each added line by type:
- **Code lines** — count at full weight
- **Comment lines** — count at 25% weight
- **Blank lines** — count at zero weight

This produces a **meaningful lines** figure for each member that better reflects substantive contribution than raw line counts.

### File-type weighting

Lines added to different file types are weighted differently to reflect their contribution significance:

| File type | Weight | Examples |
|---|---|---|
| Source code | 1.0 (full) | `.ts`, `.py`, `.java`, `.go` |
| Tests | 0.8 | `*.test.ts`, `*.spec.py` |
| Stylesheets | 0.7 | `.css`, `.scss` |
| Documentation | 0.6 | `.md`, `.txt` |
| Configuration | 0.3 | `.json`, `.yaml`, `Dockerfile` |
| Generated files | 0.0 (ignored) | `package-lock.json`, `dist/*` |

A member who adds a thousand lines to a lock file gains no advantage over one who adds two hundred lines to a source file.

### Commit-impact classification

Each commit is also classified by its apparent structural significance:

| Class | Multiplier | Criteria |
|---|---|---|
| Structural | 1.5× | Created two or more new files, or touched five or more files |
| Functional | 1.0× | Standard substantive change |
| Cosmetic | 0.5× | No source files changed, or tiny equal-sized add/delete |
| Trivial | 0.2× | Five or fewer total lines changed, no source files |

This means a single well-structured commit that introduces a new feature is weighted more heavily than many tiny cosmetic tweaks.

### Diminishing returns on commit count

Raw commit counts are passed through a logarithmic scale before being used in scoring. This prevents commit-padding — a member who makes 100 small commits does not gain a proportionally large advantage over a peer who made 50 substantive ones.

### Self-churn penalty

If a member repeatedly writes and then deletes their own code, the net effective contribution of those additions is reduced by up to 50%. This penalises writing and re-writing the same section repeatedly. Deleting other members' code is not penalised under this rule.

### Contribution share formula

After all weightings are applied, each member's final **contribution share** is calculated as:

```
Contribution Share = 0.4 × (Commit Share) + 0.4 × (Lines Share) + 0.2 × (Active Days Share)
```

Where each "share" is that member's fraction of the team's total in that category. The result is a percentage between 0 and 100 that represents that member's overall measured contribution to the team.

The default weights (40% commits, 40% lines, 20% active days) can be adjusted by the instructor on a per-project basis using the Scoring Settings panel on the project page.

### Flags

After shares are computed, each member is checked against four flag conditions:

| Flag | Meaning | Default trigger |
|---|---|---|
| **Inactive** | Zero commits recorded | 0 commits |
| **Free-rider** | Contribution share is very low relative to an equal split | Below 50% of what an equal share would be |
| **Overload** | Carrying a disproportionately large share of the work | Above 175% of what an equal share would be |
| **Deadline-driven** | Most activity concentrated in the final third of the project timeline | More than 60% of commits in the last third |

These thresholds are configurable per project. The flags are evidence for the instructor to investigate — they are not automatic penalties.

### Gini coefficient and team health

The **Gini coefficient** is a standard statistical measure of inequality applied to the team's contribution shares. A Gini of 0 means perfectly equal contributions; a Gini of 1 means one person did everything.

| Team health label | Gini range | Meaning |
|---|---|---|
| **Healthy** | Below 0.2 | Contributions are broadly balanced |
| **Moderate Risk** | 0.2 to 0.4 | Noticeable imbalance worth investigating |
| **High Risk** | 0.4 and above | Significant concentration of work in one or few members |

---

## Group Roles (Working Now)

Every group member has a **functional role** that describes their contribution responsibility. Roles exist for context only — they never change a member's score.

### The roles

- **Developer** — expected to contribute primarily via GitHub commits. Available on GitHub and Combined assignments.
- **Documentation Lead** — expected to contribute primarily via written documents. Available on Combined assignments only (the document source is planned but not yet live).
- A member may hold both roles if their work spans both areas.

### Who assigns roles

- **Leader** — can directly assign roles to any member, including themselves.
- **Member** — can suggest a role for themselves. The suggestion is marked PENDING and does not take effect until the leader approves it.
- **Instructor** — can override any role assignment at any time, bypassing the suggestion workflow.

When a leader or instructor directly assigns a role to a member who has a pending suggestion, the suggestion is automatically declined.

### What roles do — and do not do

Roles are informational context only. They help the instructor understand what each member was supposed to be doing. They do not affect contribution scores, flag thresholds, or team health in any way. A Developer with low commit activity will still receive a free-rider flag based on their actual commit data, regardless of their role label.

In a future phase, the system will flag mismatches — for example, a member assigned the Developer role who has no recorded GitHub activity — and surface this as an informational note for the instructor to investigate. This mismatch check is informational only and will not affect scores.

---

## The AI Narrative (Working Now)

After the deterministic scoring is complete, the system asks Google Gemini to write a plain-language explanation of the results. The AI receives the already-computed numbers — shares, flags, Gini coefficient, team health — and writes a paragraph explaining what they mean in the context of this particular team.

**What the AI does:** Explains patterns, describes what the numbers show, and highlights areas the instructor may want to look at further.

**What the AI never does:** Compute or change any number, assign grades, speculate about a student's intent or effort level, or make accusations. The AI's role is to translate the math into readable language.

The narrative is saved with the report and displayed on the project page. It is also included in the printable export.

---

## Fairness Tools (Working Now)

### Explainable report

Every number in the report can be traced back to raw data. The detailed metrics table shows commits, meaningful lines, active days, self-churn ratio, and weighted scores for each member. There are no black-box judgments.

### Printable / exportable report

The full report — health badge, contribution chart, member table, flags, narrative — can be printed or exported directly from the project page.

### Instructor alerts

When a group's analysis produces a High Risk or Moderate Risk team health result, or when a member is flagged, the system automatically creates an in-app alert for the instructor. The alerts page shows all pending alerts with read/unread tracking.

### Student dispute workflow

Students who believe their contribution was not fully captured can file a dispute from their group page. The dispute includes a written reason and records the flags that were active at the time of filing.

The instructor sees all disputes on the Disputes page, filterable by status (open or all) and by class section. From there, they can open a resolve modal, write a response, and mark the dispute as Resolved or Dismissed. The student then sees the instructor's response on their group page alongside the original dispute.

### Per-project scoring configuration

**Working now:** Instructors can adjust the scoring weights and flag thresholds for any individual project using the Scoring Settings panel on the project detail page. If scoring settings are changed after the most recent analysis was run, the system flags this with a warning to remind the instructor that the displayed report was produced with the previous settings and the project should be re-analysed.

---

## Admin Panel (Working Now)

Accounts with the Admin system role have access to a separate admin panel with the following tools.

### User management

- List all users in the system with search by name or email, and filter by role
- Change any user's system role (Admin, Instructor, or Student)
- Activate or deactivate any account (deactivated users cannot log in)
- Delete a user (removes their account and associated records)
- Admins cannot demote their own role or deactivate their own account

### Institution overview

A live dashboard showing:
- Total user counts broken down by role
- Total class sections
- Total groups and how many have been analysed
- Distribution of team health labels (Healthy / Moderate Risk / High Risk) across all analysed groups
- Counts of each flag type across all groups
- Number of open disputes
- A list of all at-risk groups (any group currently in High Risk or Moderate Risk) with their health label, Gini score, and the instructor responsible

### Audit log

A paginated log of administrative actions, filterable by action type:
- Role changed
- User activated
- User deactivated
- User deleted

Each entry records who performed the action, what was changed, and when.

---

## Coming Next

The following features are designed and planned but not yet built.

### FairTraze Docs — Collaborative Editor

**Coming next:** The second data source for contribution analysis. FairTraze Docs is a live collaborative writing environment built directly into FAIR TRAZE AI (not Google Docs or any external tool). Multiple students can edit a shared document in real-time, with each person's edits tracked and attributed to their account.

What it will record:
- Text each member inserted and deleted, with timestamps
- How much of each member's writing survived to the final document (net retained text — the writing equivalent of meaningful lines in GitHub)
- Edit sessions, activity rhythms, and whether edits were concentrated near the deadline
- Comments written, suggestions made, and whether those suggestions were accepted by others
- Whether each edit was substantive prose, revision of existing text, formatting-only, or trivial

The editor will display each member's contributions in a distinct colour, giving the instructor an at-a-glance visual of who wrote what.

### Combined GitHub + Docs scoring

**Coming next:** For assignments where both GitHub and document contributions are relevant, the system will score each source independently, then blend the results:

```
Combined Share = (GitHub Share × GitHub weight) + (Docs Share × Docs weight)
```

The default blend is 50/50, configurable per assignment by the instructor. Both sources go through the same deterministic math — the AI explains the combined result but does not compute it.

### Role-source mismatch detection

**Coming next:** Once both data sources are active, the system will flag cases where a member's assigned functional role does not match their recorded activity. For example, a member assigned as Developer who has no GitHub commits, or a Documentation Lead who has no editor activity. This is surfaced as an informational note for the instructor — it does not change scores or assign blame.

---

## What FAIR TRAZE AI Deliberately Does Not Do

- **It does not assign grades.** The system produces evidence — contribution shares, flags, Gini coefficients, and a narrative. The instructor reads that evidence and makes their own grading decision with full professional judgment.

- **It does not judge the quality of work.** The system measures whether work was done and how much of it — commits made, lines written, documents edited. It cannot and does not assess whether the code was well-designed, whether the writing was insightful, or whether the decisions made were correct. Quality remains the instructor's domain.

- **It does not capture everything.** Offline contributions — discussions in person, verbal design decisions, manual testing, mentoring teammates — leave no digital trace. The system is transparent about this boundary. Students can use the dispute workflow to give the instructor context about contributions the system could not see.

- **It does not replace instructor judgment.** Every design decision in this system — the scoring formula, the flag thresholds, the Gini bands — involves reasoned defaults, not proven empirical ground truth. Instructors can adjust thresholds, review disputes, and override the system's framing at any point. The system supports their judgment; it does not substitute for it.
