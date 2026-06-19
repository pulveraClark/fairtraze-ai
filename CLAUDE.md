# FAIR TRAZE AI — Project Context

This file gives you (Claude Code) the context for this capstone project. Read it before making changes.

## What this system is
FAIR TRAZE AI helps instructors fairly assess individual contributions in academic group projects. It collects digital collaboration traces, scores each member's contribution, detects participation imbalance (free-riding, overload, deadline-driven work), and produces an explainable, evidence-based fairness report. It **supports** instructor judgment — it never replaces it and never assigns grades.

## Core principle (do not violate)
**The math scores; the AI explains.** All contribution scores, flags, the Gini coefficient, and the team-health label are computed deterministically in code (`shared/src/scoring.ts`). The AI (Gemini) only writes a plain-language explanation of those already-computed numbers. The AI must never compute, change, or override the numbers, and must never assign grades. Keep this separation intact.

## What is actually built (one core transaction — do not expand beyond this)
**"Generate an Explainable Contribution Fairness Report from a GitHub repository."**
Flow: pick a project → fetch each member's GitHub activity via Octokit → compute scores, flags, and team health → Gemini writes the fairness narrative → save and display it.

### Out of scope — DO NOT build these (they are designed but future modules)
- The FAIR TRAZE Collaborative Editor and any document/Google Docs integration
- Login, accounts, and roles (admin / instructor / group leader / student)
- Project join codes, team creation, role assignment, and member self-registration
- Predictive alerts and institutional/admin analytics

## Designed setup-responsibilities workflow (proposed flow — NOT built; show it in the System Overview only)
Setup is distributed so an instructor with many sections and many groups per section is not a data-entry bottleneck:
- **Instructor**: creates the assignment/project and shares a join code; oversees results and can confirm/lock the roster and repo before grading. Retains final authority.
- **Group Leader**: creates the group and connects the GitHub repository.
- **Each Member**: joins via the code and self-registers their own GitHub username.
- **Integrity safeguards** (important for a fairness system): members confirm their own usernames (most accurate, hardest to manipulate); the instructor oversees and locks; and the system surfaces unmatched GitHub contributors, so a missing or mis-mapped member is automatically visible.
This prototype does NOT implement roles, join codes, or self-registration. It uses a seeded roster. The workflow above is the proposed design to be communicated in the System Overview, not built.

## Stack
- **client**: React + Vite + TypeScript + Tailwind + Recharts — an instructor-facing dashboard
- **server**: Express + TypeScript + Prisma (SQLite) + Octokit (GitHub) + Gemini API
- **shared**: shared TypeScript types and the deterministic scoring module

## Data model (Prisma)
- `Project { id, name, repoUrl, createdAt }`
- `Member { id, projectId, studentName, githubUsername }`
- `Report { id, projectId, generatedAt, gini, teamHealth, content }`

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

- **Phase A — Auth & Roles**: `User` model, Google OAuth + email/password, session management, ADMIN/INSTRUCTOR/STUDENT access control.
- **Phase B — Team Formation**: `School`, `Department`, `ClassSection`, `Assignment`, `Group`, `GroupMembership`; join-code flow; group leader sets repo and assigns functional roles; instructor locks roster.
- **Phase C — Student Dashboards**: student read-only view of own report; flag-for-review action.
- **Phase D — Combined Analysis**: editor data collection and blended scoring for `COMBINED` assignments; role-aware mismatch detection.
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
- **Editor contribution measurement** — should be measured as net retained text (text that survives to the final version), not gross typing volume. Bulk pastes should be dampened. To be implemented in Phase D.
- **Co-authored / pair-programming commits** — currently credit only the Git committer. GitHub's `Co-authored-by:` trailer in commit messages can optionally be parsed to credit co-authors; documented as a limitation, not yet implemented.
- **Pure coordination / management work** — offline contributions (meetings, planning, communication) are not captured in any platform trace. The instructor must account for these manually. The system surfaces what it can measure and is explicit about this boundary.

## Rules for changes
- Do not change the scoring or imbalance logic in `shared/` — it is deliberately deterministic and must stay defensible.
- Do not build any out-of-scope module listed above; for the designed workflow, present it as UI/overview content only.
- Keep the frontend clean, professional, and instructor-facing.
- Never present system outputs as final grades; they are evidence to support the instructor's decision.
