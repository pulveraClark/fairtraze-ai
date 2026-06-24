# FAIR TRAZE AI — Project Context

This file gives you (Claude Code) the context for this capstone project. Read it before making changes.

## What this system is
FAIR TRAZE AI helps instructors fairly assess individual contributions in academic group projects. It collects digital collaboration traces from **GitHub** and the **FAIR TRAZE Collaborative Editor**, scores each member's contribution deterministically across both sources, detects participation imbalance (free-riding, overload, deadline-driven work), and produces an explainable, evidence-based fairness report — so instructors can assess individual work with confidence. It **supports** instructor judgment — it never replaces it and never assigns grades.

**Current implementation:** GitHub analysis only. The Collaborative Editor is the planned second data source (Phase D — TipTap + Yjs). This prototype demonstrates the full GitHub pipeline end-to-end.

## Core principle (do not violate)
**The math scores; the AI explains.** All contribution scores, flags, the Gini coefficient, and the team-health label are computed deterministically in code (`shared/src/scoring.ts`). The AI (Gemini) only writes a plain-language explanation of those already-computed numbers. The AI must never compute, change, or override the numbers, and must never assign grades. Keep this separation intact. This principle applies equally to both data sources.

## What is actually built (one core transaction — do not expand beyond this)
**"Generate an Explainable Contribution Fairness Report from a GitHub repository."**
Flow: pick a project → fetch each member's GitHub activity via Octokit → compute scores, flags, and team health → Gemini writes the fairness narrative → save and display it.

**Current scope = GitHub only.** The combined GitHub + Editor analysis is Phase D. Do not build the editor or combined scoring without an explicit phase instruction.

### Out of scope — DO NOT build these (they are designed but future modules)
- The FAIR TRAZE Collaborative Editor and any document/Google Docs integration
- Predictive alerts and institutional/admin analytics

### Already implemented (do not re-build or change the foundation)
- **Phase A**: `User` model, email/password auth (bcryptjs + JWT), `AuthContext`, `ProtectedRoute`, `/dashboard` authenticated area.
- **Phase B**: `ClassSection`, `Assignment`, `GroupMembership`; join-code flow; student group creation (leader) and joining (member); leader reassignment; member removal/leave. Analyzer and scoring are unchanged — GitHub usernames sourced from `User.githubUsername`.

## FAIR TRAZE Collaborative Editor (Second Data Source)

**Status: DESIGNED / PLANNED — Phase D. The current build analyses GitHub only.**

The Collaborative Editor is a writing environment built directly into FAIR TRAZE AI (not Google Docs or any external tool). It records per-user, timestamped document collaboration traces and is the system's planned second data source — complementing GitHub to cover documentation and writing contributions alongside technical code work.

### What it records
- Characters and words inserted / deleted, with user attribution tied to the logged-in account
- Edit session boundaries and activity bursts
- Comments authored, suggestions made, and whether those suggestions were accepted
- Full revision history of the shared document, preserved for analysis

### Why it matters — the system's main differentiator
GitHub captures code. The Collaborative Editor captures writing and documentation. Together they give instructors a view of both technical and documentary contributions — especially important for teams where some members are primarily documentation or research contributors who appear invisible in GitHub data alone. This dual-source integration distinguishes FAIR TRAZE AI from tools that analyse only code repositories.

### Combined scoring (Phase D)
Each source produces its own per-member contribution share, normalised independently within that source. The two shares are then blended:

```
combinedShare = wGitHub × githubShare + wEditor × editorShare
```

Default blend: 50/50 (`wGitHub = 0.5`, `wEditor = 0.5`). Instructor-configurable per Assignment. The blending is deterministic; the AI only writes the plain-language narrative. The math-scores-AI-explains principle is fully preserved.

### Identity
Editor activity is tied to the logged-in `User` account — stronger than GitHub's self-registered usernames (a user cannot mis-attribute their own edits). The same identity unifies activity across both sources; there is no per-group re-registration of editor credentials.

### Responsibility-source mapping
A member's functional role implies an expected primary data source:
- **Developer** → GitHub (code commits)
- **Documentation Lead** → Collaborative Editor (document authorship)
- **Project Manager / Coordinator** → both
- **Designer / Researcher** → context-dependent

When `sourceType = COMBINED`, the system can flag a mismatch between a member's assigned role and their recorded activity (e.g. assigned Developer but almost no GitHub commits). This mismatch is surfaced in the report for the instructor to review — it does **not** automatically re-weight scores, and the default scoring is always role-agnostic.

## Editor Scoring Model (Planned)

Mirrors the GitHub scoring structure. Signals are grouped by category:

### Core authorship
- **Net retained text** *(primary meaningful-contribution signal)* — text the member contributed that survived to the final version of the document, not gross typing volume. This is the editor analog of `meaningfulLines` in GitHub scoring.
- Characters / words inserted and deleted per user
- Words and sections authored (by predominant contributor per region)

### Activity & volume
- Total edit operations
- Churn (characters added + deleted)
- Self-churn — writing then deleting one's own text before it survives; penalised analogously to the GitHub self-churn ratio
- Editing sessions and activity bursts

### Temporal
- Active editing days (distinct calendar days with recorded edits)
- Edit-timing distribution across the project timeline — supports deadline-driven detection (edits concentrated near the deadline)
- First and last edit timestamps; editing consistency

### Structural / content-type weighting
Each edit is classified by substance, analogous to commit-impact classification:
- **Substantive prose** (new content, arguments, explanations) → high weight
- **Revision** (rewriting/improving existing content) → moderate weight
- **Formatting-only** (headings, bold, spacing, table structure) → low weight
- **Trivial** (punctuation, single-character corrections) → minimal weight

### Collaboration-specific
- Comments authored
- Suggestions made (tracked-change suggestions in the editor)
- Suggestions accepted by others (indicates influence on the document)
- Edits to others' text (review / refinement work)

### GitHub → Editor signal mapping

| GitHub signal | Editor equivalent |
|---|---|
| Commits | Editing sessions |
| Lines added / deleted (churn) | Words added / deleted |
| Meaningful lines (`code + 0.25 × comments`) | Net retained text |
| Active days | Active editing days |
| Commit-impact class (structural / functional / cosmetic / trivial) | Edit-type weight (substantive / revision / formatting / trivial) |
| Self-churn ratio | Self-churn ratio (own text later deleted) |
| Deadline-driven flag | Deadline-driven flag (edit-timing distribution) |

### Recommended MVP pillars
Mirror the GitHub model as closely as possible:
1. **Net retained text** — primary lines-equivalent signal
2. **Active editing days** — participation rhythm
3. **Edit-timing distribution** — deadline-driven detection
4. **Self-churn ratio** — penalise writing then deleting one's own work

Comments and suggestions are secondary signals — valuable context but harder to weight fairly across different project types.

## Known Editor-Scoring Limitations (future work)

Documented measurement challenges, not bugs:

- **Copy-paste and AI-generated text** — a large paste or AI-generated block appears as original authorship in the edit log. Bulk-paste detection (character-velocity thresholds, paste-event signals from the editor) should dampen these. Resolution policy not yet designed.
- **Typist credit** — one member may type up content authored collaboratively offline or dictated by another. The system credits the typist by default; the instructor must account for offline collaboration manually.
- **Formatting inflation** — applying a heading style to a large section registers as many edits but represents little intellectual contribution. Edit-type weighting (substantive vs formatting) mitigates but does not eliminate this.
- **Concurrent real-time attribution** — in real-time collaborative editing (multiple cursors simultaneously), character-level attribution is harder to resolve unambiguously than discrete Git commits. The Yjs CRDT tracks per-user edits, but concurrent simultaneous edits to the same region require a resolution policy.

## Designed setup-responsibilities workflow (proposed flow — NOT built; show it in the System Overview only)
Setup is distributed so an instructor with many sections and many groups per section is not a data-entry bottleneck:
- **Instructor**: creates the assignment/project and shares a join code; oversees results and can confirm/lock the roster and repo before grading. Retains final authority.
- **Group Leader**: creates the group and connects the GitHub repository.
- **Each Member**: joins via the code and self-registers their own GitHub username.
- **Integrity safeguards** (important for a fairness system): members confirm their own usernames (most accurate, hardest to manipulate); the instructor oversees and locks; and the system surfaces unmatched GitHub contributors, so a missing or mis-mapped member is automatically visible.
This prototype does NOT implement roles, join codes, or self-registration. It uses a seeded roster. The workflow above is the proposed design to be communicated in the System Overview, not built.

## Group Formation & Leadership (Phase B — IMPLEMENTED)

**Status: IMPLEMENTED.** Join-code lookup, group creation (student becomes LEADER), group join (MEMBER), leader reassignment, and member removal/leave are all functional. The analyzer and scoring are unchanged.

### Join code and formation flow

One assignment = one join code, created by the instructor when they create the assignment. Students use the code through two distinct paths:

1. **Create a group → Group Leader.** The first student to use the code for a new group creates that group: sets the group name and links the GitHub repository (for GitHub/Combined assignments). By doing so they become the group's **leader**. Exactly one leader per group at all times.
2. **Join an existing group → Member.** Subsequent students use the same assignment code, select the group their leader has already created, and register as a member. Their GitHub username is drawn from their account profile.

### Leader determination

The group leader is whoever creates/registers the group using the assignment join code — a first-come designation. The instructor can reassign the leader for edge cases (e.g., the original leader drops the course).

### Leadership is administrative only — no scoring effect

**`isLeader Boolean` on `GroupMembership` grants no contribution credit and has zero effect on any score.** The leader is scored on their actual GitHub commits and document edits, exactly like every other member. The `isLeader` flag and the `functionalRole` field are entirely separate:
- `isLeader` — structural/logistical: who registered the group, who the instructor contacts for roster questions.
- `functionalRole` — contribution responsibility: Developer, Documentation Lead, etc.

A leader always has a `functionalRole` describing their actual contribution work. Being the leader grants no automatic advantage.

### Integrity safeguards

- Each member self-registers their own GitHub username from their account profile (most accurate; hardest to mis-attribute from the outside).
- The instructor oversees and can lock the roster before analysis/grading.
- The system surfaces unmatched GitHub contributors so a missing or mis-mapped member is automatically visible.

## Group Roles (design)

**Status: Persistence implemented (Phase B — `functionalRole` stored on `GroupMembership`). Source-presence mismatch detection is Phase D.**

This section describes the role model for group members — what the roles are, what they do, and — critically — what they do not do to scores.

### The three roles

| Role | Kind | Expected source | Status |
|---|---|---|---|
| **Leader** | Administrative flag | — | Implemented (`isLeader` on `GroupMembership`) |
| **Developer** | Functional role | GitHub | Persisted; mismatch detection in Phase D |
| **Documentation** | Functional role | FairTraze Docs (Editor) | Persisted; source active in Phase D |

`functionalRole` is stored as a free-form string so instructor-specific labels remain possible. These three are the default roles for this system.

### Leadership is a flag, not a job

`isLeader` is an administrative marker: it records who created the group, who is the instructor's point of contact, and who coordinates the group's setup. It is not a contribution category and it is not a job description.

**`isLeader` has zero effect on any score.** The leader is scored on their actual recorded traces — GitHub commits and (later) editor edits — in exactly the same way as every other member. If a leader's contribution share falls below the free-rider threshold, they receive the `free-rider` flag like any other member. Leadership is invisible to the scoring engine.

Every member, including the leader, also holds a **functional role** (Developer and/or Documentation) that describes their actual contribution work. `"Leader + Developer"` is a normal and expected combination. `"Leader"` alone is not a valid functional role assignment.

A member may hold more than one functional role (e.g. Developer + Documentation) when their work spans both sources. The free-form `functionalRole` field accommodates this.

### Roles never change scores

Functional roles add **context only**. They do not alter the contribution formula, shift any member's score, or create exemptions or floors. The `contributionShare` formula in `scoring.ts` is role-agnostic and always deterministic:

```
contributionShare = 0.4 × commitShare + 0.4 × linesShare + 0.2 × activeDaysShare
```

This is deliberate. Keeping scoring role-agnostic preserves:
- **Objectivity** — two members with identical traces receive identical scores regardless of their assigned roles.
- **Defensibility** — the instructor can verify every score from the raw trace data alone.
- **Resistance to mis-assignment** — a member cannot be shielded from a flag by being given a role whose source is not being analysed.

### What roles do — source-presence mismatch note

Each functional role implies an expected primary source:
- **Developer** → expected to have GitHub commit activity
- **Documentation** → expected to have FairTraze Docs editing activity (Phase D)

The system checks whether the member was **active** in that source and surfaces a soft **NOTE** to the instructor if they were not (e.g. "Developer with no commit activity in the analysis window"). This is informational context to help the instructor investigate — it is not a contribution flag (`free-rider`, `overload`, etc.), it does not affect the member's score, and it is not an accusation.

Only roles with a clearly traceable source drive this check:
- **Developer / GitHub** — active now.
- **Documentation / FairTraze Docs** — activates once the Collaborative Editor exists (Phase D).

Roles whose work leaves no platform trace (e.g. Researcher, Project Manager) produce no mismatch check because there is no source to compare against.

### The honest limit (known limitation)

The system verifies **presence** in the expected source, not the **quality** of the role's output. It can determine that a Developer made commits; it cannot determine whether those commits implemented the right features well. It can determine that a Documentation contributor edited the shared document; it cannot determine whether the writing was substantive.

Quality assessment remains the instructor's professional judgment. The student dispute workflow (Phase C) gives members a path to explain contributions the system cannot see — offline coordination, verbal design discussions, manual testing, code review given in person.

This is a documented limitation, not a gap to be closed by expanding what roles control. Expanding role influence on scores would introduce subjectivity and reduce defensibility.

### Role assignment model (hybrid)

The group leader assigns each member's functional role(s) — including their own — during group formation. Members may self-suggest their role to the leader before it is locked. The instructor can view and override any role assignment at any point before analysis.

This is low-stakes precisely because roles only add context: a mis-assigned functional role cannot protect a member from a contribution flag, since flags are computed from actual recorded traces regardless of the role label.

## Stack
- **client**: React + Vite + TypeScript + Tailwind + Recharts — an instructor-facing dashboard
- **server**: Express + TypeScript + Prisma (SQLite) + Octokit (GitHub) + Gemini API
- **shared**: shared TypeScript types and the deterministic scoring module

## Data model (Prisma)
- `Project { id, groupName, name, repoUrl, assignmentLabel, createdAt }`
- `Member { id, projectId, studentName, githubUsername }`
- `Report { id, projectId, generatedAt, gini, teamHealth, content }`

### Three distinct name fields on Project (do not conflate)
A student team, the app they build, and the repository they use are three different things. The model tracks all three:

| Field | Meaning | Example |
|---|---|---|
| `groupName` | The student team — the entity the instructor manages. **Primary identifier on the dashboard.** | "Group 1" |
| `name` | The app or project the team is building. Secondary detail. | "FairTraze AI" |
| `repoUrl` | The GitHub repository URL where their code lives. | `github.com/…/Sysarch` |
| `assignmentLabel` | The subject/assignment this group belongs to. Format: `"CODE — Subject Name"`. Used to group cards on the dashboard. | "CC-APPSDEV22 — Applications Development" |

`groupName` and `assignmentLabel` default to `""` so migrations are non-breaking for existing rows (the backend falls back to `"Group {id}"` / `"General Assignment"` when empty). The seed populates both for all three demo projects.

## Key computed types (`shared/src/types.ts`)
- `RawMemberStats`: commits, additions, deletions, commitDates, plus optional `codeLinesAdded?`, `commentLinesAdded?`, `blankLinesAdded?` (populated by the GitHub diff fetch)
- `ScoredMember`: commits, additions, deletions, churn, activeDays, lastPhaseRatio, commitShare, linesShare, activeDaysShare, contributionShare, codeLinesAdded, commentLinesAdded, blankLinesAdded, codeToCommentRatio, flags
- `Flag` = "inactive" | "free-rider" | "overload" | "deadline-driven"
- `TeamReport`: members, memberCount, gini, teamHealth ("Healthy" | "Moderate Risk" | "High Risk")
- `ScoringWeights`: commits (0.4), lines (0.4), activeDays (0.2) — `lines` was formerly `churn`

## Meaningful Contribution Analysis (`shared/src/lineClassifier.ts`)
Added in `feature/meaningful-contribution`. The scoring's line-magnitude signal is now `meaningfulLines = codeLinesAdded + 0.25 * commentLinesAdded` (weight 0.4, same position as old churn).

- `classifyAddedLines(filename, addedLines)` in `shared/src/lineClassifier.ts` classifies each added line as `"code"`, `"comment"`, or `"blank"` using language-aware comment markers derived from the file extension. Supported: js/ts/jsx/tsx/java/c/cpp/cs/go/rs (`//`, `/*`), py/rb/sh/yaml (`#`), html/xml (`<!--`), sql/lua (`--`), css/scss/less (`/*`). Unknown extensions: all lines count as code.
- The GitHub fetch (`server/src/lib/github.ts`) samples up to **50 commits per member** via `GET /repos/{owner}/{repo}/commits/{sha}`, parses the diff patch for lines starting with `+` (not `++`), and accumulates classified line totals.
- Blank lines contribute **zero** to `meaningfulLines`, so large formatting-only commits don't inflate scores.
- The AI (Gemini) still only explains the already-computed numbers. It must never assess code quality.

## Contribution Significance Scoring (`shared/src/fileWeights.ts`, `shared/src/commitClassifier.ts`)
Added in `feature/significance-scoring`. A fully deterministic layer that adjusts the lines and commit signals to better reflect the weight of the work. "Math scores, AI explains" is preserved.

### File-type weights (`FILE_WEIGHTS` in `fileWeights.ts`)
Not all added lines are equal. Lines in a production source file carry more weight than lines in a lock file.

| Category | Weight | Examples |
|---|---|---|
| `source` | 1.0 | `.ts`, `.tsx`, `.py`, `.java`, `.go`, … |
| `test` | 0.8 | `*.test.ts`, `*.spec.ts`, `__tests__/*` |
| `style` | 0.7 | `.css`, `.scss`, `.less` |
| `docs` | 0.6 | `.md`, `.txt`, `.rst` |
| `other` | 0.5 | Anything not otherwise categorised |
| `config` | 0.3 | `.json`, `.yaml`, `Dockerfile`, `.gitignore`, … |
| `generated` | 0.0 | `package-lock.json`, `dist/*`, `*.min.js`, `*.map` |

`categorizeFile(filename)` and `getFileWeight(filename)` are exported from `shared/src/fileWeights.ts`.

### Commit-impact multipliers (`COMMIT_IMPACT` in `commitClassifier.ts`)
Each commit is classified by `classifyCommit(stats)` and its weighted additions are multiplied accordingly.

| Class | Multiplier | Criteria |
|---|---|---|
| `structural` | 1.5 | ≥2 new files created OR ≥5 files touched |
| `functional` | 1.0 | Default — substantive source-file change |
| `cosmetic` | 0.5 | No source files, OR equal adds/deletes (<20 lines total) |
| `trivial` | 0.2 | ≤5 total lines changed, no source files |

### Log-scale commit diminishing returns
Raw commit counts are passed through `Math.log(commits + 1)` before normalisation. This neutralises commit-padding — a member who makes 100 tiny commits gains far less advantage over a peer with 50 substantive commits than the raw ratio would imply.

### Self-churn penalty
`effectiveAdditions = weightedAdditions × (1 − 0.5 × selfChurnRatio)`

`selfChurnRatio` is the fraction of lines a member added that they later deleted themselves (tracked per file, oldest-commit-first). A member who writes and rewrites the same section repeatedly is penalised at most 50% — the penalty never zeroes out contribution, and it does not apply to deleting *other members'* lines.

### How these combine in `scoring.ts`
```
logCommits         = Math.log(commits + 1)
effectiveAdditions = weightedAdditions × (1 − 0.5 × selfChurnRatio)
commitShare        = logCommits / Σ logCommits
linesShare         = effectiveAdditions / Σ effectiveAdditions
contributionShare  = 0.4 × commitShare + 0.4 × linesShare + 0.2 × activeDaysShare
```
When `weightedAdditions` is absent (e.g. in existing tests), `effectiveAdditions` falls back to `meaningfulLines`, so all prior test expectations are preserved.

## Audience and tone
The user is an **instructor**. Both the UI and the AI report must be professional, factual, fair, and **non-accusatory** — describe patterns and cite evidence, never moralize or accuse. Privacy is a stated system value; demo data should use anonymized member names (e.g. "Member A").

## Terminology (from the capstone paper)
- **Contribution Profiling**: building participation profiles from activity records.
- **Participation Imbalance Detection**: identifying free-riding, workload concentration, minimal involvement, and deadline-driven activity.
- **Explainable AI**: outputs that provide transparent explanations and supporting evidence for the system's analysis.

## Institutional Hierarchy (target structure for upcoming phases)

**Designed, not yet implemented.** Do not build any part of this without an explicit task instruction.

### Hierarchy

```
School
  └── Department
        └── ClassSection (owned by one Instructor)
              └── Assignment (created by Instructor; has joinCode, sourceType, deadline)
                    └── Group (student team; holds repoUrl, memberships, reports)
                          ├── GroupMembership (one per Student; has isLeader, functionalRole)
                          └── Report (one per analysis run)
```

- **School** — top-level institution. Has many Departments.
- **Department** — belongs to a School. Has many Instructors and many ClassSections.
- **ClassSection** — a course section owned by one Instructor in one Department.
- **Assignment** — an instructor-created assignment within a ClassSection. Holds the `joinCode` (students use it to join groups), `sourceType` (GITHUB | EDITOR | COMBINED), `deadline`, optional `startDate`, optional `maxGroupSize`, and the analysis configuration for all groups under it.
- **Group** — a student team under one Assignment. Holds `repoUrl` (nullable — editor-only assignments have no repo), memberships, and reports. This is the direct equivalent of the current `Project`.
- **GroupMembership** — links a Student (`User` with role `STUDENT`) to a Group. Has `isLeader` (structural, exactly one per group) and `functionalRole` (flexible label, optional). GitHub identity is unified on the User account, not stored per-membership.
- **Report** — output of one analysis run. Belongs to a Group.

### Mapping from current (flat) schema to target

| Current (prototype) | Target | Notes |
|---|---|---|
| `Project` | `Group` (under `Assignment`) | Project is flat with nothing above it; Group sits inside an Assignment inside a ClassSection. |
| `Member.githubUsername` | `User.githubUsername` | Identity unified on the User account; not repeated per group. |
| `Member` | `GroupMembership` | Now links a real authenticated User to a Group with isLeader and functionalRole. |
| `Report.projectId` | `Report.groupId` | Same data, repointed to Group. |
| *(none)* | `User`, `Assignment`, `School`, `Department`, `ClassSection` | Not in prototype. |

### Phase mapping

- **Phase A — Auth & Roles** *(IMPLEMENTED)*: `User` model, email/password auth (bcryptjs + JWT), `AuthContext`, `ProtectedRoute`, `/dashboard` authenticated area. Deferred: per-instructor data scoping and `requireAuth` on analyze/summary/narrative endpoints.
- **Phase B — Team Formation** *(IMPLEMENTED)*: `ClassSection`, `Assignment`, `GroupMembership`; join-code flow; student group creation (LEADER) and joining (MEMBER); leader reassignment (`POST /api/groups/:id/reassign-leader`); member removal/leave (`DELETE /api/groups/:id/members/:userId`); `GroupManageModal` on both instructor and student views. Analyzer and scoring unchanged. `School`/`Department` hierarchy and instructor roster-lock deferred.
- **Phase C — Student Dashboards**: student read-only view of own report; flag-for-review action.
- **Phase D — Combined Analysis**: FAIR TRAZE Collaborative Editor (TipTap + Yjs); editor data collection and blended scoring for `COMBINED` assignments; role-aware mismatch detection.
- **Phase F — Institutional Analytics**: cross-group/section dashboards for ADMIN; aggregated Gini trends.

The full draft schema is in `server/prisma/schema.target.prisma` (reference only — not used by the app).

## Roles (target design — designed, not yet implemented)

### Layer 1 — System role (on User)

`ADMIN | INSTRUCTOR | STUDENT` — controls login, permissions, and which UI surfaces are visible. Stored as an enum on `User`. Does not change within a session.

### Layer 2 — Group functional role (on GroupMembership)

A member's contribution responsibility within their specific group. Stored as a free-form `String?` — not a hardcoded enum — so it can vary across courses and project types without a schema change. Multiple members may share the same label (no uniqueness constraint).

Default labels (suggestions only, configurable per instructor):
- Developer
- Documentation Lead
- Designer
- Researcher
- Tester
- Project Manager / Coordinator

**`isLeader Boolean`** is a separate structural field — exactly one per group. It marks the member who created the group and connected the repo. `"Leader"` is **not** a `functionalRole` value: the group leader also has a `functionalRole` describing their actual contribution work (e.g. "Developer" or "Project Manager"). Being the leader grants **no automatic contribution credit** — the leader is scored on actual visible work exactly like every other member.

**Integrity.** The group leader assigns `functionalRole` to each member during team formation (Phase B). The instructor can view and override any assignment before locking the roster.

**Role-aware mismatch flagging (Phase D).** A `functionalRole` implies an expected primary data source: Developer → GitHub; Documentation Lead → Editor; Project Manager → both. When `sourceType = COMBINED`, the system flags cases where a member's assigned role does not match their recorded activity (e.g. assigned Developer but almost no GitHub commits). This is surfaced as a flag and explained in the AI narrative — not used to automatically re-weight scores.

**Role-based score re-weighting is optional and not the default.** The default scoring stays deterministic, transparent, and role-agnostic. Re-weighting requires explicit instructor configuration and must be documented clearly in the report output.

## Analysis & Fairness Logic (target design — designed, not yet implemented)

### Combining sources (COMBINED assignments)

Compute each member's share independently within each source (each normalized to [0, 1] across the team), then blend:

```
combinedShare = wGitHub × githubShare + wEditor × editorShare
```

Default blend: 50 / 50 (`wGitHub = 0.5`, `wEditor = 0.5`). Instructor-configurable per Assignment. The math stays deterministic; the AI only explains the result.

### Deadline-driven detection

When an Assignment has a `deadline`, anchor the timeline to `[startDate (if set) or first recorded activity → deadline]` instead of the commit range. This makes the "last-third" window fixed and predictable rather than shifting with each analysis run.

### Configurable thresholds

The scoring weights and flag thresholds listed below are reasoned defaults, **not empirically validated**. They are documented as defaults and can be overridden by the instructor per Assignment.

| Parameter | Default | Meaning |
|---|---|---|
| Commit weight | 0.4 | Share of contributionShare from commit count |
| Lines weight | 0.4 | Share from meaningfulLines |
| Active days weight | 0.2 | Share from distinct active days |
| Free-rider threshold | 0.5 × equalShare | Below this → free-rider flag |
| Overload threshold | 1.75 × equalShare | Above this → overload flag |
| Deadline-driven threshold | 0.6 (lastPhaseRatio) | > 60% of commits in final third |
| Healthy Gini | < 0.2 | Low inequality |
| Moderate Risk Gini | 0.2 – 0.4 | Moderate inequality |
| High Risk Gini | ≥ 0.4 | High inequality |

## Identity & Authentication (target design — Phase A)

**Identity is anchored to the User account.** The GitHub username is a self-registered attribute on the `User` model (`githubUsername String?`). Editor activity is captured under the logged-in `User`. This is how the system unifies identity across data sources — there is no per-group re-registration of platform usernames.

**Authentication method.** Google OAuth is the primary sign-in method (students and instructors already have institutional Google accounts). Email/password is a fallback. Implemented in Phase A.

## Student Agency (target design — Phase C)

Students get a **read-only view of their own contribution report** — they can see their scores and flags but cannot see other members' individual data. They have one action: **"Flag for review / add a note"**, which submits a short free-text note to the instructor (a dispute/contestation path). The instructor is notified and retains final authority. Implemented in Phase C dashboards.

## Known Limitations (design record)

These are documented limitations to be addressed in future phases, not bugs.

- **Non-commit GitHub activity** (pull requests, reviews, issue comments) — data is available via the GitHub API and planned as light secondary signals, but not yet collected or scored.
- **Collaborative Editor measurement** — not yet implemented (Phase D). See the "Editor Scoring Model" section for the planned approach and the "Known Editor-Scoring Limitations" section for documented measurement challenges.
- **Co-authored / pair-programming commits** — currently credit only the Git committer. GitHub's `Co-authored-by:` trailer in commit messages can optionally be parsed to credit co-authors; documented as a limitation, not yet implemented.
- **Pure coordination / management work** — offline contributions (meetings, planning, communication) are not captured in any platform trace. The instructor must account for these manually. The system surfaces what it can measure and is explicit about this boundary.

## Rules for changes
- Do not change the scoring or imbalance logic in `shared/` — it is deliberately deterministic and must stay defensible.
- Do not build any out-of-scope module listed above; for the designed workflow, present it as UI/overview content only.
- Keep the frontend clean, professional, and instructor-facing.
- Never present system outputs as final grades; they are evidence to support the instructor's decision.
