# FAIR TRAZE AI — System Vision

> **Reading guide.** This document is written in two layers. The first layer — the Overview — uses plain language and is intended for instructors, panelists, and anyone evaluating the product idea. The second layer — the Technical Reference — fills in the exact formulas, data flows, and implementation details for engineers and researchers. Implementation labels are used throughout:
>
> - *(implemented)* — working in the current codebase
> - *(planned)* — designed and specified, not yet built
> - *(aspirational)* — future direction, not yet designed in detail

---

## Table of Contents

1. [What FairTraze AI Is](#1-what-fairtraze-ai-is)
2. [The Roles](#2-the-roles)
3. [The Lifecycle](#3-the-lifecycle)
4. [Data Source 1 — GitHub Analysis](#4-data-source-1--github-analysis)
5. [Data Source 2 — FairTraze Docs](#5-data-source-2--fairtraze-docs)
6. [Combined Scoring](#6-combined-scoring)
7. [Flags and Team Health](#7-flags-and-team-health)
8. [The AI Narrative Layer](#8-the-ai-narrative-layer)
9. [Alerts](#9-alerts)
10. [Reports and Exports](#10-reports-and-exports)
11. [Privacy, Oversight, and Student Agency](#11-privacy-oversight-and-student-agency)
12. [Near-Term Roadmap](#12-near-term-roadmap)
13. [Future Vision](#13-future-vision)
14. [Technical Reference](#14-technical-reference)

---

## Part I — Overview

*Plain language for instructors, panelists, and evaluators.*

---

## 1. What FairTraze AI Is

### The problem

Group projects are a staple of tertiary education. They teach collaboration, divide labour, and mirror real workplace teams. But they carry a persistent fairness problem: when grades are assigned to the group as a whole, individual contribution is invisible to the instructor.

Some students do the majority of the work. Others contribute very little — sometimes nothing at all — yet receive the same grade. This is the **free-rider problem**, and it is well-documented in educational research. At the same time, the opposite pattern also occurs: one student takes on so much that the rest of the group becomes dependent on them. Neither extreme is educationally fair.

Instructors know these patterns exist. The difficulty is that they lack the evidence to act on them. Asking students to self-report contribution is unreliable. Observing every group is impossible at scale. And the final deliverable — a working application or a document — rarely reveals who built what.

### What FairTraze AI does

FairTraze AI collects the digital traces that group work naturally leaves behind — code commits on GitHub and, in the fully-developed system, edits inside a built-in collaborative document editor — and turns them into a structured, evidence-based **contribution fairness report**.

For each group member, the report shows:
- Their share of the team's total contribution, expressed as a percentage
- How that share compares to an equal distribution among all members
- Participation patterns: how many days they were active, whether they worked steadily or only near the deadline
- Any automated flags raised by the system (free-rider, overload, deadline-driven activity, or inactivity)

For the whole team, the report shows a **team health label** — Healthy, Moderate Risk, or High Risk — derived from a statistical measure of how evenly contribution is distributed.

An AI assistant (Google Gemini) then reads these computed numbers and writes a short plain-language explanation of what they mean, in professional, non-accusatory language appropriate for an academic setting.

### The core principle: the math scores, the AI explains

This is the foundational design rule of FairTraze AI and it is never broken:

> **All scores, flags, and team health labels are computed deterministically by code. The AI only writes a plain-language description of those already-computed numbers. The AI never assigns, adjusts, or infers any score.**

This separation matters for a fairness system. Deterministic code can be audited, understood, and challenged. A large language model cannot be fully audited — its outputs can vary, hallucinate, or reflect biases. By confining the AI to the role of narrator, FairTraze AI ensures that every number an instructor sees is traceable to an explicit, inspectable formula.

### What FairTraze AI is not

- It does **not** assign grades. The report is evidence to support the instructor's judgment, never a substitute for it.
- It does **not** capture offline contributions: verbal discussions, planning sessions, whiteboard work, or any collaboration that leaves no digital trace. The system is explicit about this boundary.
- It does **not** assess the quality or correctness of code or writing. It measures participation signals — volume, timing, and breadth — not intellectual quality.

---

## 2. The Roles

FairTraze AI has three user roles.

### Instructor *(implemented)*

The instructor is the primary user of the system. They:
- Create their own class sections, each identified by a subject code and EDP code
- Create assignments within those classes, configure the analysis source (GitHub, Docs, or both), and set a deadline
- Share a join code with their students so groups can form themselves
- View the contribution dashboard: a card for every group, showing team health at a glance
- Click into any group to see the full fairness report — individual scores, flags, the AI narrative, and a bar chart of contribution shares
- Receive automatic alerts when a group's health is Moderate or High Risk
- Retain final authority on grading: the report informs their decision; it does not make it

### Student *(planned)*

In the fully-developed system, students interact with FairTraze AI to register their team and, for writing-based projects, to collaborate on documents inside the platform.

- **Group leader:** The first student to use an assignment join code creates the group, sets the group name, and connects the GitHub repository. They become the group's leader for administrative purposes — this is a structural designation only and carries no contribution credit.
- **Group member:** Subsequent students use the same join code to join their existing group. Each student registers their own GitHub username from their account profile, ensuring that identity mapping is accurate and self-attributed.
- In the completed system, each student can view their own contribution report (their scores and flags only — not other members' data) and submit a short written dispute or note for the instructor to consider.

### Admin *(planned)*

The administrator role is intended for institutional oversight — a department coordinator or system administrator who needs a cross-section view across multiple instructors' classes. In the full system they can view aggregated participation trends, manage the instructor roster, and review system-wide health metrics. This role is designed but not yet implemented.

---

## 3. The Lifecycle

### How an instructor sets up a class and assignment *(implemented)*

1. The instructor logs in and creates a **class section** — for example, "CC-APPSDEV22 Applications Development, BSIT, EDP 31400." The EDP code makes each section uniquely identifiable within the instructor's account.
2. Inside that class, the instructor creates an **assignment** — for example, "Final Application Project." They choose the analysis source type (GitHub only, FairTraze Docs only, or Combined), set an optional deadline, and set the maximum group size.
3. The system generates a unique **join code** — a short alphanumeric string the instructor shares with their students.

### How students form groups *(implemented)*

The join code supports two distinct flows:

**Creating a group (becomes the group leader)**
The first student who uses the join code to form a new group:
- Enters the join code
- Provides the group name (e.g., "Group 1")
- Links the GitHub repository URL (for GitHub or Combined assignments)
- Becomes the group's **leader**

**Joining an existing group (becomes a member)**
Subsequent students use the same assignment join code, select their group from the list of already-created groups, and join as a member. Their GitHub username is drawn from their FairTraze AI account profile — they registered it themselves, which is the strongest identity guarantee the system can provide.

### The leader role is administrative only *(implemented)*

Being the group leader means: you registered the group and you are the system's contact point for roster questions. It means nothing else.

> **The leader receives zero contribution credit for being the leader.** Their contribution score is computed from their actual GitHub commits and document edits, exactly the same way every other member's score is computed. Leadership is administrative; contribution is measured.

### Running the analysis *(implemented)*

Once the group is formed and the project is connected, the instructor clicks "Analyze" on the group's page. The system:
1. Fetches each member's GitHub activity from the connected repository
2. Computes contribution scores and flags using the deterministic scoring formulas
3. Saves the report
4. Optionally generates an AI narrative on demand

The instructor can re-analyze at any time — for example, at a midterm checkpoint and again at the end of the project. Each analysis reflects the state of the repository at that moment.

---

## 4. Data Source 1 — GitHub Analysis

### Plain-language explanation

Every time a student pushes code to a GitHub repository, Git records who made the change, when, and what was changed — which files, how many lines were added, and how many were removed. FairTraze AI reads this history, maps each contribution to the student who made it, and uses it to compute a fair share of the team's total effort.

The system does not simply count commits or lines of code naively. It applies several layers of adjustment to ensure the score reflects genuine, sustained contribution rather than superficial activity:

- **Log-scaling commits** neutralises commit-spam. A student who makes 100 tiny commits gains far less advantage over a student who makes 50 substantial commits than the raw numbers would suggest.
- **Meaningful-line counting** separates code from comments and blank lines. Comments count lightly (at 25% of a code line's weight), and blank lines count for nothing. This means reformatting a file to add blank lines cannot inflate a score.
- **File-type weighting** ensures that lines added to a generated lockfile (`package-lock.json`) or a configuration file contribute almost nothing, while lines added to actual source code contribute fully.
- **Commit-impact classification** recognises that commits that add new files or touch many files at once are more structurally significant than a two-line cosmetic tweak.
- **Self-churn penalty** discounts a student who writes and then deletes their own work in later commits, which otherwise inflates both their additions and deletions without representing lasting contribution.
- **Active-days measurement** rewards students who work consistently over time, not just in a burst at the end.

### How GitHub usernames are mapped to students

Each student registers their own GitHub username in their FairTraze AI account profile when they join. This self-registration approach is intentionally chosen: the person best placed to accurately report their own GitHub username is the student themselves, and they have no incentive to mis-attribute it. The instructor can see who has registered a username, and the system flags any GitHub contributors in the repository who are not matched to a registered student.

---

## 5. Data Source 2 — FairTraze Docs *(planned)*

### Plain-language explanation

Not every valuable contribution to a group project appears in a code repository. Documentation, research summaries, technical reports, and project plans are often written in Google Docs or similar tools — environments where individual authorship is invisible to FairTraze AI, and where a single student can silently do (or avoid) most of the writing.

FairTraze Docs is a built-in collaborative document editor — similar in experience to Google Docs — that lives directly inside the FairTraze AI platform. Because it is built into the system, it can record exactly who wrote what, when, and whether that writing survived to the final version of the document.

In the fully-developed system, when a student types in FairTraze Docs, their text appears in their assigned colour. A student reading the document can see at a glance which sections were written by whom, just as colour-coded author highlighting works in collaborative editors. Every character, insertion, and deletion is attributed to the logged-in user's account — not a username that someone else could enter, but the actual account.

### What FairTraze Docs measures

The primary signal is **net retained text** — the text each member contributed that is still present in the document at the end of the project. This is the writing equivalent of "meaningful code lines": it measures lasting intellectual contribution to the document, not typing volume. A student who writes 2,000 words that survive to the final document is credited more than a student who writes 5,000 words that are mostly deleted or rewritten.

Secondary signals include:
- Characters and words inserted and deleted, with per-user attribution
- Active editing days — how many distinct calendar days a student made edits
- Edit-session timing — whether editing was spread across the project or concentrated near the deadline
- Comments written and suggestions made (and whether those suggestions were accepted by others, indicating influence on the document's direction)
- Self-churn — writing text and then deleting it before it survives; penalised the same way as in the GitHub model

### Edit-type weighting *(planned)*

Not all writing effort is equally substantive. FairTraze Docs classifies each edit into one of four categories:

| Edit type | Weight | Description |
|---|---|---|
| Substantive prose | High | New content: arguments, explanations, original writing |
| Revision | Moderate | Rewriting or significantly improving existing content |
| Formatting only | Low | Headings, bold, spacing, table structure — no new content |
| Trivial | Minimal | Single-character corrections, punctuation |

This weighting mirrors the commit-impact classification in GitHub scoring.

### Mapping FairTraze Docs signals to the GitHub model *(planned)*

The GitHub and Docs scoring models are deliberately parallel:

| GitHub signal | FairTraze Docs equivalent |
|---|---|
| Commits | Editing sessions |
| Meaningful lines (code + 0.25 × comments) | Net retained text |
| Active days | Active editing days |
| Deadline-driven flag | Deadline-driven flag (edit-timing distribution) |
| Self-churn ratio | Self-churn ratio (own text later deleted) |
| Commit-impact class | Edit-type weight |
| Lines in source files | Words in substantive prose sections |

### Known limitations of document measurement *(planned)*

These are documented measurement challenges in the FairTraze Docs design, not bugs:

- **Copy-paste and AI-generated text.** A large paste or a block of AI-generated text appears as an insertion by the user who pasted it. The system currently has no reliable way to detect this. Bulk-paste detection — using character-velocity thresholds or paste-event signals — is planned as a mitigation.
- **Typist credit.** One student may type up content that was authored collaboratively offline or dictated by a teammate. The system credits the typist by default. Instructors must account for offline collaboration manually.
- **Formatting inflation.** Applying a heading style to a large section registers as an edit but represents little intellectual contribution. Edit-type weighting reduces but does not eliminate this.
- **Concurrent real-time attribution.** When two students edit the exact same sentence simultaneously, the character-level attribution is harder to resolve than a discrete Git commit. The system uses the Yjs collaborative CRDT to track per-user edits, but a resolution policy for direct simultaneous conflicts is still being designed.

---

## 6. Combined Scoring *(planned)*

When an assignment's source type is set to **Combined**, FairTraze AI collects both GitHub activity and FairTraze Docs edits and blends them into a single contribution score per member.

Each source is scored independently, producing a per-source **contribution share** that sums to 100% across the team within that source. The two shares are then blended:

```
combinedShare = wGitHub × githubShare + wEditor × editorShare
```

The default blend is **50% GitHub, 50% FairTraze Docs**. The instructor can adjust these weights per assignment — for example, setting 70% GitHub / 30% Docs for a coding-heavy project, or 30% GitHub / 70% Docs for a project where documentation is the primary deliverable.

The math-scores-AI-explains principle applies fully to combined scoring. The blending formula is deterministic; the AI only narrates the result.

### Role-aware mismatch detection *(planned)*

In the full system, each member of a group can be assigned a **functional role** — Developer, Documentation Lead, Designer, Researcher, Project Manager, or a custom label. These roles imply an expected primary data source: a Developer is expected to contribute primarily on GitHub; a Documentation Lead is expected to contribute primarily in FairTraze Docs.

For Combined assignments, the system can detect and surface a **role-source mismatch**: for example, a member assigned as Developer but with almost no GitHub commits, or a Documentation Lead who made almost no edits in FairTraze Docs. This mismatch is reported as a flag for the instructor to consider — it does **not** automatically re-weight that member's score. The default scoring is always role-agnostic; role-based re-weighting requires explicit instructor configuration.

---

## 7. Flags and Team Health

### The four participation flags *(implemented)*

After scoring every member, the system checks each member against a set of thresholds and assigns flags where conditions are met. Flags describe participation patterns — they do not accuse anyone of anything, and they are always subject to the instructor's interpretation.

| Flag | What it means |
|---|---|
| **Inactive** | The member made zero commits (or zero document edits in a Docs or Combined project) |
| **Free-rider** | The member's contribution share is substantially below the equal share — below half of what equal participation would look like |
| **Overload** | The member's contribution share is substantially above the equal share — more than 1.75 times an equal share |
| **Deadline-driven** | More than 60% of the member's commits (or document edits) occurred in the final third of the project's timeline |

The "free-rider" and "overload" flags are complementary: a team in an unhealthy state almost always has both — one member in overload and at least one member at or near free-rider. A member can hold multiple flags simultaneously (for example, deadline-driven and free-rider).

### Team health and the Gini coefficient *(implemented)*

The **Gini coefficient** is a standard statistical measure of inequality, borrowed from economics. A Gini of 0 means perfectly equal distribution; a Gini of 1 means one person contributes everything. FairTraze AI computes the Gini across the team's contribution shares and maps it to a three-level health label:

| Gini range | Team health label |
|---|---|
| Below 0.20 | Healthy |
| 0.20 – 0.39 | Moderate Risk |
| 0.40 and above | High Risk |

These thresholds are reasoned defaults, not empirically validated benchmarks. The system treats them as configurable parameters, and in the fully-developed system instructors can adjust them per assignment.

---

## 8. The AI Narrative Layer

### What the AI does *(implemented)*

After the analysis is complete, the instructor can request an AI-generated narrative. FairTraze AI sends the already-computed scores, flags, team health label, and Gini value to Google Gemini with a strict instruction: translate these numbers into plain language. Gemini returns a short, flowing prose explanation — no headers, no bullet points — in the tone of a professional academic assessment.

A typical narrative:
- Opens with the project name and team health label
- For each flagged member: names the member, states their contribution share and commit count, and describes the meaning of their flags in plain language
- States the Gini coefficient and explains what it means for this team's distribution
- Closes by reminding the instructor that this report supports but does not replace their own judgment

The system caches the narrative in the database. Subsequent views of the same report serve the cached text instantly without calling Gemini again. The instructor can request a fresh narrative at any time, which triggers a new Gemini call.

### What the AI strictly does NOT do *(implemented — enforced by system prompt)*

The Gemini system prompt contains hard rules that are never relaxed:

- **The AI does not compute or infer flags.** The flags field passed to Gemini is the authoritative, complete list. If a member's flags are empty, the AI must say so and may not express concern about that member's numbers or suggest a flag should have fired. If a member has a flag, the AI may only mention the exact flags listed — it may not add, rename, or remove any flag.
- **The AI does not reference thresholds.** It does not write "exceeded the 0.5× threshold" or "above 1.75×." It does not know the thresholds. It describes the result.
- **The AI does not assign grades.** It explicitly reminds the instructor that the report is decision support, not a grading decision.
- **The AI does not assess code quality.** It does not read the code, does not evaluate whether the work was technically correct, and does not comment on the quality of writing in FairTraze Docs.

---

## 9. Alerts

### How alerts work *(implemented)*

After every analysis run, the system automatically checks whether the team's results warrant an alert. If the team health is Moderate Risk or High Risk, or if any member carries a flag, the instructor's alert queue is updated.

Three alert types exist:
- **High Risk** — team health is High Risk (Gini ≥ 0.40)
- **Moderate Risk** — team health is Moderate Risk (Gini 0.20–0.39)
- **Members Flagged** — one or more members carry any participation flag

Alerts appear in the instructor's navigation bar as a bell icon with an unread count badge. Clicking the bell opens a dropdown showing the most recent alerts. A dedicated full alerts page lists the complete history.

### No-duplicate rule *(implemented)*

If a team has an existing unread Moderate Risk alert and is re-analyzed at a later date still at Moderate Risk, the alert is refreshed (message and timestamp updated) rather than creating a duplicate. This keeps the alert queue clean across multiple analysis runs.

### Email notifications for alerts *(planned)*

In the fully-developed system, instructors receive email notifications when a High Risk alert is generated for any group in their classes, and students receive an email confirmation when they successfully join a group. Email delivery is not yet implemented.

---

## 10. Reports and Exports

### The fairness report *(implemented)*

Each group's report page shows:
- A **team health banner** (Healthy / Moderate Risk / High Risk) with the Gini coefficient
- A **bar chart** of contribution shares — one bar per member, with a dashed line at the equal-share level
- A **member table** with expandable rows — each row shows the member's contribution share, their flags, and on expansion: commit count, churn, active days, weighted line counts, self-churn ratio, commit-impact breakdown, and file-type breakdown
- The **AI narrative** (generated on demand)
- The **unmatched logins list** — GitHub contributors found in the repository who are not matched to any registered member, a signal that someone's GitHub username may be missing or incorrect

### Print and PDF export *(planned)*

In the fully-developed system, the instructor can print or export any report to PDF directly from the report page for inclusion in grading records.

### CSV/Excel export *(planned)*

The instructor can export contribution data for an entire class — all groups, all members, all scores — to a CSV or Excel file for use in a gradebook or for manual review.

---

## 11. Privacy, Oversight, and Student Agency

### Decision-support, not auto-grading

FairTraze AI is explicitly designed as a tool that **supports** instructor judgment — not one that replaces it. The system does not compute grades, does not recommend grade deductions, and does not communicate scoring outcomes directly to students without instructor involvement. Every score, flag, and narrative is presented to the instructor, who decides what weight to give it and how to use it in their grading process.

### Instructor oversight

The instructor is the single point of authority. They:
- Control who is in each group (can add or remove members)
- Can re-run the analysis at any point
- Can override any interpretation the AI narrative offers (the narrative is advisory text, not a decision)
- Can lock the roster before final grading to prevent late changes

### Student view and dispute *(planned)*

In the fully-developed system, each student can view their own contribution report — their scores and flags only, not other members' data. If a student believes the analysis does not accurately reflect their contribution (for example, due to offline work not captured in digital traces, or a GitHub username mapping error), they can submit a short written note or dispute through the platform. The instructor is notified and retains final authority over the response.

### Identity integrity

Two design choices strengthen the integrity of the attribution:

**FairTraze Docs ties edits to the logged-in account.** *(planned)* A student cannot attribute their document edits to a different account. The identity is the session, not a username they entered.

**GitHub usernames are self-registered.** *(implemented)* Each student registers their own GitHub username from their account profile. This is the strongest GitHub identity guarantee the system can provide — the person best placed to know their own username is the owner. The system surfaces any GitHub contributors in the repository who are not matched to a registered student, making attribution gaps visible.

### What the system cannot measure

The system is transparent about its measurement boundary:

- Offline contributions — verbal discussions, planning sessions, whiteboard design — leave no digital trace and are not captured.
- Co-authored or pair-programmed commits currently credit only the Git committer. *(aspirational: co-author trailer parsing)*
- Coordination and project management work that happens in chat tools, email, or face-to-face does not appear in either data source.

The instructor is expected to bring their own observation and judgment to fill in these gaps.

---

## 12. Near-Term Roadmap *(planned)*

These features are designed or specified and are expected to be built in the near term.

| Feature | Description |
|---|---|
| Email notifications | Automated email to instructors when a High Risk alert fires; confirmation email to students upon joining a group |
| CSV / Excel export | Export all group scores for a class to a spreadsheet for gradebook integration |
| Per-student semester view | A student's profile page summarising their contribution records across all groups and projects they participated in during the semester |
| Instructor-adjustable weights and thresholds in the UI | Allow the instructor to configure scoring weights (commit / lines / active days), flag thresholds, Gini band boundaries, and GitHub-Docs blend ratio directly from the assignment settings page, without requiring code changes |
| Student dispute workflow | Formal in-platform path for a student to flag a concern about their report; creates a notification for the instructor and records the dispute in the report history |
| FairTraze Docs editor | The built-in live collaborative editor (TipTap + Yjs), with per-character authorship tracking, color-coded contributor highlighting, and the full document scoring model |
| Student read-only report view | Each student can see their own scores and flags (not other members' data) after the instructor releases the report |

---

## 13. Future Vision *(aspirational)*

These features represent the longer-term direction of FairTraze AI. They have not been fully designed and are not committed to a timeline.

**Richer GitHub signals.** Pull request reviews, issue comments, and code review activity are visible through the GitHub API and represent meaningful participation that the current model does not capture. Adding these as secondary signals — weighted below commits and lines, since they are harder to normalise across projects — would give a more complete picture of collaborative code work.

**AI-text and paste detection in FairTraze Docs.** As AI-generated writing becomes more common, a bulk-paste detection mechanism — using character-velocity thresholds, paste-event signals from the browser, and possibly an AI-text classifier — could dampen the score inflation from pasting large blocks of generated content.

**Co-authored-commit support.** Git supports a `Co-authored-by:` trailer in commit messages that attributes a commit to multiple authors. Parsing these trailers and splitting commit credit between the committer and their co-authors would better represent pair-programming and mob-programming workflows.

**Contribution timeline visualisation.** A per-member timeline chart showing when each student worked — across the full project span — would make deadline-driven patterns visible at a glance and help instructors identify whether the pattern is a genuine concern or an expected end-of-sprint delivery.

**Institutional analytics for the Admin role.** An admin dashboard showing Gini coefficient trends across all classes, the prevalence of different flag types by subject, and instructor-level summaries would give department coordinators and programme directors the data to identify systemic participation problems.

---

## Part II — Technical Reference

*Detailed data flow, formulas, and implementation notes.*

---

## 14. Technical Reference

### 14.1 System Architecture *(implemented)*

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT — React + Vite + TypeScript + Tailwind + Recharts   │
│  Instructor dashboard, project detail pages, alerts UI       │
└────────────────────────────┬────────────────────────────────┘
                             │  HTTP (REST)
┌────────────────────────────▼────────────────────────────────┐
│  SERVER — Express + TypeScript                               │
│  Routes: auth, classes, assignments, groups, analyze,        │
│          projects, alerts, join                              │
│  Lib:    GitHub (Octokit), Gemini API, Prisma ORM            │
└────────────────────────────┬────────────────────────────────┘
                             │
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
         SQLite DB      GitHub API      Gemini API
         (Prisma)       (Octokit)       (Google GenAI)
```

**Shared package** (`shared/src/`) contains the TypeScript types and the complete deterministic scoring module. Both the server (which runs scoring) and (in a future full build) the client (for local preview) can import from it.

### 14.2 Data Model *(implemented)*

The Prisma schema defines the full institutional hierarchy:

```
User (ADMIN | INSTRUCTOR | STUDENT)
  └── ClassSection  (instructorId FK)
        └── Assignment  (classSectionId FK, onDelete: Cascade)
              └── Project / Group  (assignmentId FK nullable, onDelete: Cascade)
                    ├── Member           (projectId FK, onDelete: Cascade)
                    ├── Report           (projectId FK, onDelete: Cascade)
                    ├── GroupMembership  (projectId FK, onDelete: Cascade)
                    └── Alert            (projectId FK, onDelete: Cascade)
```

Cascade deletion is enforced at the SQLite level via `ON DELETE CASCADE` constraints — deleting a `ClassSection` automatically cascades through `Assignment → Project → {Member, Report, GroupMembership, Alert}` in a single atomic operation.

**Key fields on `Project`:**

| Field | Meaning |
|---|---|
| `groupName` | Student team name, e.g. "Group 1" — primary instructor-facing identifier |
| `name` | Application name, e.g. "FairTraze AI" |
| `repoUrl` | GitHub repository URL |
| `assignmentLabel` | Fallback display string for legacy projects not linked to an Assignment |
| `assignmentId` | FK to Assignment; `null` for legacy flat projects |

### 14.3 GitHub Analysis Pipeline *(implemented)*

#### Step 1 — Contributor discovery

`fetchRepoStats` (in `server/src/lib/github.ts`) calls the GitHub contributor stats endpoint:

```
GET /repos/{owner}/{repo}/stats/contributors
```

This endpoint is asynchronous (GitHub computes stats lazily). The client retries on `202 Accepted` responses with a 1-second delay, up to 30 attempts.

**Fallback for missing contributors.** The stats endpoint is eventually consistent and can omit low-activity contributors. `fetchRepoStats` accepts an optional `requiredLogins` list. Any login in that list that did not appear in the stats response is fetched directly via the commits endpoint:

```
GET /repos/{owner}/{repo}/commits?author={login}
```

If that login has commits, their diff data is fetched and they are added to the contributors list with full stats. This ensures that no registered member is silently dropped from the analysis.

#### Step 2 — Commit SHA and date collection

For each contributor, `fetchCommitShasAndDates` paginates through all commits authored by that login, collecting timestamps and SHAs. All pages are fetched (100 commits per page).

#### Step 3 — Diff sampling

`fetchCommitDiffs` processes the contributor's commits — capped at the 50 most recent — to stay within GitHub's rate limit (5,000 requests/hour). Commits are processed oldest-first so that self-churn tracking is chronologically correct. For each commit, the function:

1. Fetches the full commit detail including file patches
2. For each changed file: parses the `+`-prefixed lines (added) and `-`-prefixed lines (deleted) from the patch
3. Classifies each added line as `code`, `comment`, or `blank` using language-aware comment markers
4. Applies file-type weights to added lines
5. Tracks self-churn: lines added to a file in earlier commits that are deleted in later commits by the same author
6. Classifies the whole commit's impact level

#### Step 4 — Member mapping

`buildRawMembers` (in `server/src/routes/analyze.ts`) maps the DB member list to contributor data using case-insensitive GitHub username matching. Every DB member gets an entry in `rawMembers` — those not found in the GitHub data receive zero stats and will be scored as inactive.

### 14.4 Deterministic Scoring *(implemented)*

All scoring logic lives in `shared/src/scoring.ts`. Nothing outside this file computes scores.

#### Line classification and weighting

```
meaningfulLines = codeLinesAdded + 0.25 × commentLinesAdded
```

Blank lines contribute zero. Comments are counted at 25% of a code line to acknowledge that good documentation has value without allowing comment-heavy commits to dominate.

#### File-type weights

Each added line is multiplied by the weight of the file it appears in before contributing to `weightedAdditions`:

| Category | Weight | Examples |
|---|---|---|
| `source` | 1.0 | `.ts`, `.tsx`, `.py`, `.java`, `.go`, `.rs`, … |
| `test` | 0.8 | `*.test.ts`, `*.spec.ts`, `__tests__/*` |
| `style` | 0.7 | `.css`, `.scss`, `.less` |
| `docs` | 0.6 | `.md`, `.txt`, `.rst` |
| `other` | 0.5 | Uncategorised files |
| `config` | 0.3 | `.json`, `.yaml`, `.env`, `Dockerfile`, `.gitignore`, … |
| `generated` | 0.0 | `package-lock.json`, `dist/*`, `*.min.js`, `*.map` |

Generated files (`package-lock.json`, files under `dist/`, minified assets, source maps) contribute zero weight, preventing auto-generated file changes from inflating scores.

#### Commit-impact classification

Each commit is classified and its weighted line count is multiplied by an impact factor:

| Class | Multiplier | Trigger condition |
|---|---|---|
| `structural` | 1.5× | ≥ 2 new files created, OR ≥ 5 files touched |
| `functional` | 1.0× | Default for substantive source-file changes |
| `cosmetic` | 0.5× | No source files touched, OR adds ≈ deletes (ratio 0.8–1.2) with < 20 total lines |
| `trivial` | 0.2× | ≤ 5 total lines changed and no source files |

#### Self-churn penalty

Self-churn tracks how many lines a member added to a file in earlier commits that they themselves deleted in later commits:

```
selfChurnRatio = selfDeletedLines / totalLinesAdded
effectiveAdditions = weightedAdditions × (1 − 0.5 × selfChurnRatio)
```

The penalty caps at 50% (a self-churn ratio of 1.0 halves the effective additions). It never zeroes out contribution entirely. The penalty does not apply when deleting lines written by other members.

#### Log-scaling commits

```
logCommits = Math.log(commits + 1)
```

Raw commit counts are passed through a natural logarithm before normalisation. This gives diminishing returns on commit volume: a member with 100 commits does not score twice as much as a member with 50 on the commit dimension, as the raw ratio would imply.

#### Contribution share formula

```
commitShare      = logCommits_i / Σ logCommits
linesShare       = effectiveAdditions_i / Σ effectiveAdditions
activeDaysShare  = activeDays_i / Σ activeDays

contributionShare = 0.4 × commitShare + 0.4 × linesShare + 0.2 × activeDaysShare
```

Default weights: commits 40%, effective lines 40%, active days 20%. All three are configurable in `ScoringWeights`; the scoring function accepts a weights parameter.

`activeDays` is the count of distinct calendar dates on which the member made at least one commit, derived from commit timestamps.

#### Flag thresholds

| Flag | Condition |
|---|---|
| `inactive` | `commits === 0` |
| `free-rider` | `contributionShare < 0.5 × (1 / memberCount)` |
| `overload` | `contributionShare > 1.75 × (1 / memberCount)` |
| `deadline-driven` | `lastPhaseRatio > 0.6` (more than 60% of commits in the final third of the project timeline) |

`lastPhaseRatio` is computed by finding the earliest and latest commit across the whole team, dividing the span into thirds, and counting what fraction of each member's commits fall in the last third.

#### Gini coefficient and team health

```
gini = Σᵢ Σⱼ |xᵢ − xⱼ| / (2 × n × Σ xᵢ)
```

Applied to the vector of `contributionShare` values across the team.

| Gini | Team health |
|---|---|
| < 0.20 | Healthy |
| 0.20 – 0.39 | Moderate Risk |
| ≥ 0.40 | High Risk |

### 14.5 FairTraze Docs Scoring Model *(planned)*

The FairTraze Docs scoring model is designed to mirror the GitHub model as closely as possible. The four MVP signals are:

1. **Net retained text** — primary lines-equivalent signal (text contributed that survives to the final document)
2. **Active editing days** — participation rhythm
3. **Edit-timing distribution** — deadline-driven detection
4. **Self-churn ratio** — own text written and later deleted

The same `contributionShare` formula applies within the editor source:

```
editorShare = 0.4 × sessionShare + 0.4 × retainedTextShare + 0.2 × activeDaysShare
```

(subject to final design; mirrors `commitShare`, `linesShare`, `activeDaysShare`)

The editor is implemented using **TipTap** (rich-text editor framework) and **Yjs** (CRDT for real-time collaborative editing). The Yjs document tracks per-user operations with user attribution derived from the authenticated session.

### 14.6 Combined Scoring *(planned)*

```
combinedShare_i = wGitHub × githubShare_i + wEditor × editorShare_i
```

where `wGitHub + wEditor = 1`, default `wGitHub = wEditor = 0.5`.

Each source's share is independently normalised to sum to 1 across the team before blending, ensuring that a team with very little document activity (or very little code activity) does not distort the combined score.

The blended `combinedShare` replaces `contributionShare` in all flag logic and Gini computation. The math-scores-AI-explains principle is preserved: the Gemini prompt receives the blended scores and the per-source breakdowns; it narrates them but does not recalculate them.

### 14.7 AI Narrative — Implementation Details *(implemented)*

**Model:** `gemini-2.5-flash-lite` (configurable via `GEMINI_MODEL` environment variable).

**Prompt structure:** The scoring module's output is serialised into a structured plain-text block before being sent to Gemini. Each member's entry explicitly states `Flags: none` when no flags fired — not an empty array — to prevent the model from inferring flags from numbers. The system instruction enforces four categories of hard constraints (flags are authoritative, no thresholds, no contradictions, structured prose only).

**Rate-limit handling:** On a `429` response, the server parses the retry delay from the error message (if available) or defaults to 5 seconds, then makes a single retry. If the retry also fails, the error propagates and the endpoint returns `503`.

**Caching:** The narrative is stored as a JSON string alongside the `TeamReport` in the `Report.content` field. The `GET /api/projects/:id/report` endpoint returns the cached narrative on every subsequent view. The `POST /api/projects/:id/narrative?regenerate=true` endpoint forces a fresh Gemini call and overwrites the cache.

### 14.8 Alert Generation *(implemented)*

Alert generation runs after every successful analysis call, fire-and-forget (`.catch(err => console.error(...))`) so it never blocks the analysis response.

Logic:
1. Look up the project's Assignment to find the instructor ID
2. For each alert type that applies (HIGH_RISK, MODERATE_RISK, MEMBER_FLAGGED), check for an existing unread alert of the same `(projectId, type)`
3. If found: update the message, teamHealth, and timestamp (no duplicate)
4. If not found: create a new alert row

Projects without an `assignmentId` (legacy flat projects not linked to an instructor) produce no alerts.

### 14.9 Authentication and Session *(implemented)*

Authentication uses email/password (bcrypt + JWT). The JWT payload carries `sub` (user ID) and `role` (SystemRole enum). The `requireAuth` middleware validates the token on every protected route; `requireRole` additionally enforces that the caller's role matches one of the allowed roles.

Routes that require `INSTRUCTOR` role: all analysis, alert, assignment, class, and group-management endpoints. Student and admin routes are gated by their respective roles.

### 14.10 Scoring Defaults — Summary Table

| Parameter | Default | Where set |
|---|---|---|
| Commit weight | 0.4 | `DEFAULT_WEIGHTS` in `scoring.ts` |
| Lines weight | 0.4 | `DEFAULT_WEIGHTS` in `scoring.ts` |
| Active-days weight | 0.2 | `DEFAULT_WEIGHTS` in `scoring.ts` |
| Comment-to-code weight | 0.25× | `scoring.ts` (meaningfulLines formula) |
| Free-rider threshold | 0.5× equal share | `FREE_RIDER_THRESHOLD` in `scoring.ts` |
| Overload threshold | 1.75× equal share | `OVERLOAD_THRESHOLD` in `scoring.ts` |
| Deadline-driven threshold | 0.60 lastPhaseRatio | `DEADLINE_DRIVEN_THRESHOLD` in `scoring.ts` |
| Healthy Gini ceiling | 0.20 | `HEALTHY_GINI_THRESHOLD` in `scoring.ts` |
| Moderate Risk Gini ceiling | 0.40 | `MODERATE_RISK_GINI_THRESHOLD` in `scoring.ts` |
| Structural commit: min new files | 2 | `STRUCTURAL_NEW_FILES_THRESHOLD` in `commitClassifier.ts` |
| Structural commit: min files touched | 5 | `STRUCTURAL_FILES_TOUCHED_THRESHOLD` in `commitClassifier.ts` |
| Trivial commit: max total lines | 5 | `TRIVIAL_MAX_TOTAL_LINES` in `commitClassifier.ts` |
| Self-churn penalty cap | 50% | `effectiveAdditions = ... × (1 − 0.5 × ratio)` in `scoring.ts` |
| GitHub diff sample cap | 50 commits | `github.ts` |
| Combined scoring default blend | 50% / 50% | CLAUDE.md specification |

---

*FAIR TRAZE AI — Capstone Project, 2026.*
