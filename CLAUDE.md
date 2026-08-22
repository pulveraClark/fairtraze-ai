# FAIR TRAZE AI — Project Context

This file gives you (Claude Code) the context for this capstone project. Read it before making changes.

## What this system is
FAIR TRAZE AI helps instructors fairly assess individual contributions in academic group projects. It collects digital collaboration traces from **GitHub** and the **FAIR TRAZE Collaborative Editor**, scores each member's contribution deterministically across both sources, detects participation imbalance (free-riding, overload, deadline-driven work), and produces an explainable, evidence-based fairness report — so instructors can assess individual work with confidence. It **supports** instructor judgment — it never replaces it and never assigns grades.

**Current implementation:** Both data sources are implemented and live — GitHub analysis and the FAIR TRAZE Collaborative Editor (TipTap + Yjs), including blended `COMBINED` scoring for assignments that use both. GitHub-only, Editor-only, and Combined assignments are all supported end-to-end.

## Core principle (do not violate)
**The math scores; the AI explains.** All contribution scores, flags, the Gini coefficient, and the team-health label are computed deterministically in code (`shared/src/scoring.ts`). The AI (Gemini) only writes a plain-language explanation of those already-computed numbers. The AI must never compute, change, or override the numbers, and must never assign grades. Keep this separation intact. This principle applies equally to both data sources.

## What is actually built (do not re-build or change the foundation)
**"Generate an Explainable Contribution Fairness Report from GitHub activity, Collaborative Editor activity, or both."**
Flow: pick a project → fetch/compute each member's activity for the assignment's `sourceType` (GitHub via Octokit, Editor via Yjs edit events, or both blended) → compute scores, flags, and team health → Gemini writes the fairness narrative → save and display it.

### Out of scope — DO NOT build these
- Predictive alerts beyond the existing at-risk `Alert` generation, and cross-section/institutional analytics dashboards (Phase F)
- Google/OAuth-based sign-in (only email/password + JWT exists — see "Identity & Authentication")

### Already implemented (do not re-build or change the foundation)
- **Phase A**: `User` model, email/password auth (bcryptjs + JWT), `AuthContext`, `ProtectedRoute`, `/dashboard` authenticated area.
- **Phase B**: `ClassSection`, `Assignment`, `GroupMembership`; join-code flow; student group creation (leader) and joining (member); leader reassignment; member removal/leave. GitHub usernames sourced from `User.githubUsername`.
- **Phase C**: Student read-only dashboards (`StudentPage`, `StudentClassPage`, `StudentGroupPage`) showing a member's own report and flags; dispute/"flag for review" workflow (`Dispute` model, `disputes.ts`, `DisputesPage.tsx`).
- **Phase D**: FAIR TRAZE Collaborative Editor (TipTap + Yjs) with per-user edit capture, editor scoring, and `COMBINED` blended scoring (`shared/src/documentScoring.ts`, `shared/src/combinedScoring.ts`, `server/src/collab/*`). Role-aware source-presence mismatch notes are implemented (see "Group Roles" below).
- Basic admin/audit tooling: user management (create/edit/promote/deactivate), role assignment, and a system-wide audit log (`admin.ts`, `AdminPage.tsx`, `AuditLogPage.tsx`, `AuditLog` model). This is account administration, not the cross-section analytics dashboards described under Phase F below, which remain unbuilt.

## FAIR TRAZE Collaborative Editor (Second Data Source)

**Status: IMPLEMENTED.** Live for `EDITOR` and `COMBINED` assignments.

The Collaborative Editor is a writing environment built directly into FAIR TRAZE AI (not Google Docs or any external tool). It records per-user, timestamped document collaboration traces and is the system's second data source — complementing GitHub to cover documentation and writing contributions alongside technical code work.

### What it records (implemented)
- Character-level insert/delete events (`EditEvent`: position, length, timestamp), attributed to the logged-in account
- Edit sessions — contiguous editing bursts per user, closed after 30 minutes idle (`EditSession`)
- Rule-based significance classification of each insert (`EditType`: substantive / revision / formatting / trivial)

### Not implemented (documented as a limitation, not a bug)
- Comments authored and tracked-change suggestions (accepted/rejected) — no `Comment` or `Suggestion` model exists; only insert/delete shape is captured
- Full document revision history / snapshots — the system replays the `EditEvent` log to reconstruct current ownership, it does not store point-in-time document snapshots

### Why it matters — the system's main differentiator
GitHub captures code. The Collaborative Editor captures writing and documentation. Together they give instructors a view of both technical and documentary contributions — especially important for teams where some members are primarily documentation or research contributors who appear invisible in GitHub data alone. This dual-source integration distinguishes FAIR TRAZE AI from tools that analyse only code repositories.

### Combined scoring (implemented — `shared/src/combinedScoring.ts`)
Each source produces its own per-member contribution share, normalised independently within that source. The two shares are then blended:

```
combinedShare = wGitHub × githubShare + wDocs × editorShare
```

Default blend: 50/50 (`weightGithub = 0.5`, `weightDocs = 0.5` on `Project`). Instructor-configurable per Project via Scoring Settings. The blending is deterministic; the AI only writes the plain-language narrative. The math-scores-AI-explains principle is fully preserved. `flags` (including `deadline-driven`) are computed from a **unified timeline** merging both sources' timestamps, not from either source alone — see `combinedScoring.test.ts`.

### Identity
Editor activity is tied to the logged-in `User` account — stronger than GitHub's self-registered usernames (a user cannot mis-attribute their own edits). The same identity unifies activity across both sources; there is no per-group re-registration of editor credentials.

### Responsibility-source mapping
A member's functional role implies an expected primary data source (only `DEVELOPER` and `DOCUMENTATION` exist today — see "Group Roles" for the full value set):
- **Developer** → GitHub (code commits)
- **Documentation** → Collaborative Editor (document authorship)

**Implemented (`server/src/routes/projects.ts`):** a member with the `DEVELOPER` functional role and zero recorded GitHub commits gets a soft mismatch note ("Developer — no recorded GitHub activity") surfaced in the report. The equivalent `DOCUMENTATION` → Editor-activity check is implemented the same way: a member with the `DOCUMENTATION` role and zero recorded editor sessions gets "Documentation — no recorded editor activity". Mismatch notes never re-weight scores, and the default scoring is always role-agnostic.

## Editor Scoring Model (`shared/src/documentScoring.ts` — IMPLEMENTED)

Mirrors the GitHub scoring structure. Implemented signals, grouped by category:

### Core authorship
- **Net retained text** *(primary meaningful-contribution signal)* — text the member contributed that survived, weighted by edit-type significance (`weightedRetainedChars`), not gross typing volume. This is the editor analog of `meaningfulLines` in GitHub scoring.
- Characters inserted / deleted per user (`totalInsertedChars`, `totalDeletedChars`)

### Activity & volume
- Churn (characters added + deleted)
- Self-churn — writing then deleting one's own text before it survives (`selfDeletedChars` / `totalInsertedChars`); penalised the same 50%-cap formula as GitHub's self-churn ratio
- Editing sessions (`EditSession`, closed after 30 minutes idle) — the editor analog of commits, passed through the same log-scale diminishing-returns treatment

### Temporal
- Active editing days (distinct calendar days across session start times)
- Edit-timing distribution — used for the `deadline-driven` flag, but currently computed the same way as GitHub's (data-derived 2/3 split of the observed activity span). **Not yet implemented:** anchoring this window to `Assignment.deadline` (see "Analysis & Fairness Logic" below) — there is no `startDate` field on `Assignment` yet.

### Structural / content-type weighting (`shared/src/editClassifier.ts` — IMPLEMENTED)
Each INSERT event is classified by substance, analogous to commit-impact classification:
- **Substantive** (new content) → high weight
- **Revision** (rewriting existing content) → moderate weight
- **Formatting** (shape-detectable spacing/reordering/same-length replace) → low weight
- **Trivial** (punctuation, single-character corrections) → minimal weight

DELETE events and pre-migration rows have no `editType` (treated as neutral 1.0 weight).

### Collaboration-specific (NOT implemented)
Comments, tracked-change suggestions, and edits-to-others'-text review credit are not built — there is no `Comment` or `Suggestion` data model. See "What it records" above.

### Default weights (`DOCUMENT_DEFAULT_WEIGHTS`)
`retainedText: 0.4, sessions: 0.2, activeDays: 0.4` — note this differs from a literal 1:1 mirror of the GitHub weights (0.4/0.4/0.2); editor scoring weights active-days participation more heavily than session count.

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

## Known Editor-Scoring Limitations (future work)

Documented measurement challenges, not bugs:

- **Copy-paste and AI-generated text** — a large paste or AI-generated block appears as original authorship in the edit log. Bulk-paste detection (character-velocity thresholds, paste-event signals from the editor) should dampen these. Resolution policy not yet designed.
- **.docx import — IMPLEMENTED.** A member can upload a `.docx` for themselves via the "Import .docx" button in `DocumentEditor.tsx`'s toolbar (`POST /api/groups/:id/document/import`, `server/src/routes/documents.ts`). The file is parsed with mammoth + `node-html-parser` into ordered heading/paragraph/list-item chunks (`server/src/collab/docxImport.ts`), and each chunk is written via its own `ydoc.transact()` call tagged with a synthetic `ImportOrigin { type: "import", userId }` marker (`server/src/collab/authorshipCapture.ts`) — the same attribution/diff/classify/session pipeline live typing uses, producing `EditEvent`/`EditSession` rows with `source: "IMPORT"`. Scoring: `shared/src/documentScoring.ts` converts imported volume into proportional session credit (`Math.log(liveSessionCount + importedWeightedRetainedChars / typicalSessionChars + 1)`) while leaving active-days honest — an import counts as at most the one calendar day of upload — and discloses the estimate via `DocumentScoredMember.importNote`, shown on the generated report (not at import time). 5MB raw file cap (client pre-check + server post-decode check); `.docx`-only; `EDITOR`/`COMBINED` assignments only.
  - **Known limitation — room eviction.** The import route reaches the group's live `Y.Doc` via `getYDoc()`, exported from `y-websocket/bin/utils` — the same function `setupWSConnection` itself uses, so it's the identical live doc any connected client syncs to, not a disconnected copy. If the room isn't in memory yet (nobody has the editor open), `getYDoc()` creates it and runs it through the normal `persistence.bindState()` path. However, that library's *eviction* logic (persist + destroy + remove from its in-memory `docs` map) lives only inside its private, non-exported `closeConn`, gated on a WebSocket connection that *was* attached to the room closing. A room created purely by an import — no WebSocket ever attaches to it — is therefore never evicted: its `WSSharedDoc` and `authorshipCapture.ts` `RoomState` entry persist in memory for the life of the server process. Accepted as a documented limitation (narrow at capstone scale — one resident object per group that imports before ever live-opening the editor) rather than reimplementing that library's private cleanup logic.
  - **Known limitation — inline formatting is not preserved.** Chunking extracts plain text only (`HTMLElement.text`, stripping mammoth's inline `<strong>`/`<em>` tags); bold/italic/etc. from the original `.docx` do not survive import, only paragraph/heading/list structure does.
- **Typist credit** — one member may type up content authored collaboratively offline or dictated by another. The system credits the typist by default; the instructor must account for offline collaboration manually.
- **Formatting inflation** — applying a heading style to a large section registers as many edits but represents little intellectual contribution. Edit-type weighting (substantive vs formatting) mitigates but does not eliminate this.
- **Mark/node-type-only edits are invisible, not just unweighted** — the capture pipeline (`server/src/collab/authorshipCapture.ts`) diffs plain text only (`Y.XmlText.toString()`). Toggling bold/italic on already-typed text, or converting a paragraph to a heading, changes no character content, so it produces **zero** `EditEvent` rows — not an unclassified one. Step 4b's edit-type classification (`shared/src/editClassifier.ts`) therefore only ever sees insert/delete shape (length, replace ratio) and cannot detect these mark-only operations at all. The FORMATTING bucket still fires for the shape-detectable subset — same-length replace, reordering, spacing touch-ups — just not for a bare bold/heading toggle with no text change. Capturing mark/node-type transactions would require extending Step 3's capture logic, not just the weighting layer.
- **Concurrent real-time attribution** — in real-time collaborative editing (multiple cursors simultaneously), character-level attribution is harder to resolve unambiguously than discrete Git commits. The Yjs CRDT tracks per-user edits, but concurrent simultaneous edits to the same region require a resolution policy.
- **Possible room bind/eviction race (unconfirmed, not reproduced under normal usage)** — during read-only authorship-view testing, rapid automated connect/disconnect cycling against the same collab room was observed to reset a group's persisted `Document.yjsState` back to empty in `server/src/collab/persistence.ts`'s `bindState`/eviction lifecycle. Not reproduced under normal single-session usage; flagged for future investigation, not fixed in this session.

## Setup-responsibilities workflow (IMPLEMENTED)
Setup is distributed so an instructor with many sections and many groups per section is not a data-entry bottleneck. This is real, working flow — not a proposed design:
- **Instructor**: creates the class section and assignment, gets a join code; oversees results and can reassign leaders. Retains final authority.
- **Group Leader**: the first student to use the assignment's join code creates the group, sets the group name, and (for GitHub/Combined assignments) links the GitHub repository.
- **Each Member**: joins via the same code, selects the leader's group, and registers with their own account's `githubUsername` (set once in Settings, not re-entered per group).
- **Integrity safeguards**: members self-register their own GitHub username on their account (most accurate, hardest to manipulate); the instructor oversees and can reassign leadership; the system surfaces unmatched GitHub contributors so a missing or mis-mapped member is visible in the report.

The `server/prisma/seed.ts` script only seeds two demo login accounts (an instructor and an admin) to make local development possible — it does not stand in for this registration flow, which is fully live via `server/src/routes/join.ts`.

## Group Formation & Leadership (Phase B — IMPLEMENTED)

**Status: IMPLEMENTED.** Join-code lookup, group creation (student becomes LEADER), group join (MEMBER), leader reassignment, and member removal/leave are all functional. The analyzer and scoring are unchanged.

### Join code and formation flow

One assignment = one join code, created by the instructor when they create the assignment. Students use the code through two distinct paths:

1. **Create a group → Group Leader.** The first student to use the code for a new group creates that group: sets the group name and links the GitHub repository (for GitHub/Combined assignments). By doing so they become the group's **leader**. Exactly one leader per group at all times.
2. **Join an existing group → Member.** Subsequent students use the same assignment code, select the group their leader has already created, and register as a member. Their GitHub username is drawn from their account profile.

### Leader determination

The group leader is whoever creates/registers the group using the assignment join code — a first-come designation. The instructor can reassign the leader for edge cases (e.g., the original leader drops the course).

### Leadership is administrative only — no scoring effect

**`role: MembershipRole` (`LEADER`/`MEMBER`) on `GroupMembership` grants no contribution credit and has zero effect on any score.** The leader is scored on their actual GitHub commits and document edits, exactly like every other member. The leader flag and the `functionalRoles` field are entirely separate:
- `role` (LEADER/MEMBER) — structural/logistical: who registered the group, who the instructor contacts for roster questions.
- `functionalRoles` — contribution responsibility: `DEVELOPER` and/or `DOCUMENTATION` (see "Group Roles" below for the actual value set — it is not free-form).

A leader always has functional role(s) describing their actual contribution work. Being the leader grants no automatic advantage.

### Integrity safeguards

- Each member self-registers their own GitHub username from their account profile (most accurate; hardest to mis-attribute from the outside).
- The instructor oversees and can lock the roster before analysis/grading.
- The system surfaces unmatched GitHub contributors so a missing or mis-mapped member is automatically visible.

## Group Roles

**Status: IMPLEMENTED.** `functionalRoles` is stored on `GroupMembership` as a JSON-encoded array of a **fixed two-value set** — `"DEVELOPER"` and/or `"DOCUMENTATION"` (`server/src/lib/roles.ts`, `GroupManageModal.tsx`). It is **not** a free-form string field despite earlier drafts of this doc describing it that way — there is no support today for arbitrary instructor-defined labels (Designer, Researcher, Tester, PM, etc.).

### The three roles

| Role | Kind | Expected source | Status |
|---|---|---|---|
| **Leader** | Administrative flag (`GroupMembership.role = "LEADER"`) | — | Implemented |
| **Developer** (`"DEVELOPER"`) | Functional role | GitHub | Implemented; source-presence mismatch note implemented |
| **Documentation** (`"DOCUMENTATION"`) | Functional role | FairTraze Docs (Editor) | Implemented; source-presence mismatch note implemented |

A member may hold both roles at once (`functionalRoles: ["DEVELOPER","DOCUMENTATION"]`). The default assigned on join/create is driven by the assignment's `sourceType` (`defaultFunctionalRoles()` in `server/src/lib/roles.ts`): `EDITOR` → `["DOCUMENTATION"]`, `GITHUB`/`COMBINED` → `["DEVELOPER"]`. The available choices in `GroupManageModal` are further filtered by `sourceType` (a `GITHUB`-only assignment only offers Developer, etc.).

### Leadership is a flag, not a job

`role = "LEADER"` on `GroupMembership` is an administrative marker: it records who created the group, who is the instructor's point of contact, and who coordinates the group's setup. It is not a contribution category and it is not a job description.

**Leadership has zero effect on any score.** The leader is scored on their actual recorded traces — GitHub commits and editor edits — in exactly the same way as every other member. If a leader's contribution share falls below the free-rider threshold, they receive the `free-rider` flag like any other member. Leadership is invisible to the scoring engine.

Every member, including the leader, also holds functional role(s) (Developer and/or Documentation) that describe their actual contribution work. `"Leader + Developer"` is a normal and expected combination. `"Leader"` alone is not a valid functional role assignment.

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
- **Developer** → expected to have GitHub commit activity — **implemented**: surfaces a soft note (e.g. "Developer — no recorded GitHub activity") when a Developer has zero commits in the stored report.
- **Documentation** → expected to have FairTraze Docs editing activity — **implemented**: surfaces a soft note (e.g. "Documentation — no recorded editor activity") when a Documentation member has zero recorded editor sessions in the stored report.

This is informational context to help the instructor investigate — it is not a contribution flag (`free-rider`, `overload`, etc.), it does not affect the member's score, and it is not an accusation.

### The honest limit (known limitation)

The system verifies **presence** in the expected source, not the **quality** of the role's output. It can determine that a Developer made commits; it cannot determine whether those commits implemented the right features well. It can determine that a Documentation contributor edited the shared document; it cannot determine whether the writing was substantive.

Quality assessment remains the instructor's professional judgment. The student dispute workflow (implemented — see "Student Agency" below) gives members a path to explain contributions the system cannot see — offline coordination, verbal design discussions, manual testing, code review given in person.

This is a documented limitation, not a gap to be closed by expanding what roles control. Expanding role influence on scores would introduce subjectivity and reduce defensibility.

### Role assignment model

Roles are assigned through a tiered authority model:

- **Leader** — assigns functional roles to any member, including themselves, directly through the Manage Group modal. Applied immediately; no approval step.
- **Member** — may _suggest_ a functional role for themselves from their project view. This creates a **PENDING** `RoleSuggestion` record visible to the leader in the Manage Group modal. The suggested role does **not** apply until the leader accepts. On Decline, no change is made and the member can suggest again.
- **Instructor** — can override any member's role directly via the same Manage Group modal, bypassing the suggestion flow.

Suggesting a role never changes the member's actual `functionalRoles` — only an Accept (or a direct leader/instructor assignment) does. Any PENDING suggestion is automatically declined when the leader/instructor directly assigns a role to that member.

This is low-stakes precisely because roles only add context: a mis-assigned functional role cannot protect a member from a contribution flag, since flags are computed from actual recorded traces regardless of the role label.

## Stack
- **client**: React + Vite + TypeScript + Tailwind + Recharts — an instructor-facing dashboard
- **server**: Express + TypeScript + Prisma (PostgreSQL, hosted on Neon) + Octokit (GitHub) + Yjs (Collaborative Editor) + Gemini API
- **shared**: shared TypeScript types and the deterministic scoring module

## Data model (Prisma)
The full schema (`server/prisma/schema.prisma`) is substantially larger than the original prototype — `User`, `ClassSection`, `ClassEnrollment`, `Assignment`, `GroupMembership`, `GroupJoinRequest`, `RoleSuggestion`, `Alert`, `Dispute`, `AuditLog`, `Document`, `EditEvent`, and `EditSession` are all real models, not just `Project`/`Member`/`Report`. The three below are the original core and remain central to the GitHub-side pipeline:
- `Project { id, groupName, name, repoUrl, assignmentLabel, assignmentId, weightCommits/weightLines/weightActiveDays, freeRiderThreshold/overloadThreshold/deadlineDrivenThreshold, weightGithub/weightDocs, createdAt }` — the "Group" in the target Institutional Hierarchy below; per-project scoring config now lives on this row.
- `Member { id, projectId, studentName, githubUsername }` — legacy per-group GitHub identity row, kept in sync with `GroupMembership`/`User.githubUsername`.
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
- The GitHub fetch (`server/src/lib/github.ts`) samples up to **100 commits per member** via `GET /repos/{owner}/{repo}/commits/{sha}`, parses the diff patch for lines starting with `+` (not `++`), and accumulates classified line totals.
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

## Institutional Hierarchy (target structure)

**Partially implemented.** `ClassSection`, `Assignment`, `GroupMembership`, `User`, and `Report` all exist and match this shape today. **Not implemented:** the `School` and `Department` levels above `ClassSection` (a `ClassSection` currently points directly at its owning `instructorId`, with no department/school layer), and the `Project` → `Group` rename (the model is still called `Project` in the live schema). Do not build School/Department or rename `Project` without an explicit task instruction.

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

### Remaining gap to the target shape

| Current (live) | Target | Notes |
|---|---|---|
| `Project` | `Group` (rename only — already sits under `Assignment` via `assignmentId`) | Purely a naming gap; the parent-child relationship already exists. |
| `Member.githubUsername` (still present, kept in sync) | `User.githubUsername` only | `User.githubUsername` is already the identity source of truth; the legacy per-group `Member` row has not been removed. |
| `Report.projectId` | `Report.groupId` | Naming gap only, once `Project` is renamed. |
| *(none)* | `School`, `Department` | The only structural levels genuinely not built — `ClassSection` currently points directly at `instructorId` with no institution/department layer above it. |

### Phase mapping

- **Phase A — Auth & Roles** *(IMPLEMENTED)*: `User` model, email/password auth (bcryptjs + JWT), `AuthContext`, `ProtectedRoute`, `/dashboard` authenticated area. `analyze`/`narrative` endpoints now enforce `requireRole("INSTRUCTOR")` plus ownership checks (see `analyze.ts`). Deferred: Google OAuth (see "Identity & Authentication").
- **Phase B — Team Formation** *(IMPLEMENTED)*: `ClassSection`, `Assignment`, `GroupMembership`; join-code flow; student group creation (LEADER) and joining (MEMBER); leader reassignment (`POST /api/groups/:id/reassign-leader`); member removal/leave (`DELETE /api/groups/:id/members/:userId`); `GroupManageModal` on both instructor and student views. Analyzer and scoring unchanged. `School`/`Department` hierarchy deferred.
- **Phase C — Student Dashboards** *(IMPLEMENTED)*: student read-only view of own report and flags (`StudentPage`, `StudentClassPage`, `StudentGroupPage`); flag-for-review dispute workflow (`disputes.ts`, `DisputesPage.tsx`, `Dispute` model).
- **Phase D — Combined Analysis** *(IMPLEMENTED)*: FAIR TRAZE Collaborative Editor (TipTap + Yjs); editor data collection and blended scoring for `COMBINED` assignments (`shared/src/documentScoring.ts`, `shared/src/combinedScoring.ts`). Role-aware mismatch detection: both Developer→GitHub and Documentation→Editor checks are implemented (see "Group Roles" above).
- **Phase F — Institutional Analytics**: cross-group/section dashboards and aggregated Gini trends — **not implemented**. Basic account administration (user CRUD, role assignment, audit log) already exists via `admin.ts`/`AdminPage.tsx` but is not the cross-section analytics this phase describes.

The full draft schema is in `server/prisma/schema.target.prisma` (reference only — not used by the app).

## Roles (IMPLEMENTED — Layer 1; Layer 2 implemented with a narrower value set than earlier drafts of this doc described)

### Layer 1 — System role (on User)

`ADMIN | INSTRUCTOR | STUDENT` — controls login, permissions, and which UI surfaces are visible. Stored as a `SystemRole` enum on `User`. Does not change within a session.

### Layer 2 — Group functional role (on GroupMembership)

A member's contribution responsibility within their specific group. Stored as `functionalRoles: String` — a JSON-encoded array, restricted in practice to `"DEVELOPER"` and/or `"DOCUMENTATION"` (see "Group Roles" above for the full detail). This is **not** the free-form arbitrary-label field earlier drafts of this doc described (Designer, Researcher, Tester, PM, etc. are not supported today) — extending the value set is a real future task, not something already built.

The leader flag (`GroupMembership.role = "LEADER"`) is a separate structural field — exactly one per group. It marks the member who created the group and connected the repo. `"Leader"` is **not** a `functionalRoles` value: the group leader also has functional role(s) describing their actual contribution work (e.g. `DEVELOPER`). Being the leader grants **no automatic contribution credit** — the leader is scored on actual visible work exactly like every other member.

**Integrity.** The group leader assigns `functionalRoles` to each member directly (`GroupManageModal`); members can suggest a role for themselves via `RoleSuggestion` (see "Role assignment model" above). The instructor can override any assignment.

**Role-aware mismatch flagging.** Both Developer → GitHub and Documentation → Editor mismatch notes are implemented (`server/src/routes/projects.ts`). Mismatch notes are surfaced as context, not used to automatically re-weight scores.

**Role-based score re-weighting is optional and not the default.** The default scoring stays deterministic, transparent, and role-agnostic. Re-weighting requires explicit instructor configuration and must be documented clearly in the report output — this remains undesigned/unbuilt.

## Analysis & Fairness Logic

### Combining sources (COMBINED assignments) — IMPLEMENTED
See "Combined scoring" above (`shared/src/combinedScoring.ts`). Instructor-configurable per Project via `PATCH /api/projects/:id/config`.

### Deadline-driven detection — IMPLEMENTED
The `deadline-driven` flag's "last third" window is anchored to the real `Assignment.deadline` when one is set, for all three scoring paths (GitHub, Editor, Combined): `phaseStart = firstActivityTimestamp + (2/3) × (deadline - firstActivityTimestamp)`. There is still no `startDate` field on `Assignment`, so the window's start remains the group's first observed activity, not the assignment's real start — only the end anchor changed. Activity *after* the deadline still counts toward the last-phase bucket (no upper bound on the window) — late work is at least as indicative of deadline-driven behavior as on-time last-minute work, so excluding it would let post-deadline crunching avoid the flag entirely.

When an assignment has no deadline set, scoring falls back to the previous behavior unchanged — a 2/3 split of the observed activity span (min→max timestamp). Each `TeamReport` discloses which basis produced it via `deadlineWindowBasis: "assignment-deadline" | "activity-span"`, surfaced in `GET /api/projects/:id/report` and `GET /api/student/group/:projectId`, and shown as a small note next to the deadline-driven flag on both the instructor and student views.

### Configurable thresholds — IMPLEMENTED
Scoring weights and flag thresholds are per-`Project` columns (`weightCommits`, `weightLines`, `weightActiveDays`, `freeRiderThreshold`, `overloadThreshold`, `deadlineDrivenThreshold`, `weightGithub`, `weightDocs`) and are editable by the instructor via `ScoringSettingsModal.tsx` → `PATCH /api/projects/:id/config`. The values below are the defaults, **not empirically validated**.

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

## Identity & Authentication

**Identity is anchored to the User account (IMPLEMENTED).** The GitHub username is a self-registered attribute on the `User` model (`githubUsername String?`). Editor activity is captured under the logged-in `User`. This is how the system unifies identity across data sources — there is no per-group re-registration of platform usernames.

**Authentication method.** Only email/password + JWT is implemented (`server/src/routes/auth.ts`, bcryptjs + JWT). **Google OAuth does not exist in this codebase** — there is no OAuth client, callback route, or Google-related dependency anywhere in `server/` or `client/`. If OAuth sign-in is wanted, treat it as new work, not a fix to something broken.

## Student Agency (IMPLEMENTED — Phase C)

Students get a **read-only view of their own contribution report** — they can see their scores and flags but cannot see other members' individual data (`StudentGroupPage.tsx`, `GET /api/student/group/:projectId`). They have one action: **"Flag for review / add a note"**, which submits a short free-text note to the instructor (`Dispute` model, `disputes.ts`, `DisputesPage.tsx`). The instructor is notified and retains final authority.

## Known Limitations (design record)

These are documented limitations to be addressed in future phases, not bugs.

- **Non-commit GitHub activity** (pull requests, reviews, issue comments) — data is available via the GitHub API and planned as light secondary signals, but not yet collected or scored.
- **Collaborative Editor measurement** — implemented; see "Editor Scoring Model" for what's measured and "Known Editor-Scoring Limitations" for the specific measurement challenges that remain (copy-paste/AI-generated text, typist credit, formatting inflation, mark/node-type-only edits, concurrent real-time attribution).
- **Co-authored / pair-programming commits** — currently credit only the Git committer. GitHub's `Co-authored-by:` trailer in commit messages can optionally be parsed to credit co-authors; documented as a limitation, not yet implemented.
- **Pure coordination / management work** — offline contributions (meetings, planning, communication) are not captured in any platform trace. The instructor must account for these manually. The system surfaces what it can measure and is explicit about this boundary.

## Rules for changes
- Do not change the scoring or imbalance logic in `shared/` — it is deliberately deterministic and must stay defensible.
- Do not build the out-of-scope items listed above (cross-section analytics dashboards, Google/OAuth sign-in) without an explicit instruction.
- Keep the frontend clean, professional, and instructor-facing.
- Never present system outputs as final grades; they are evidence to support the instructor's decision.
