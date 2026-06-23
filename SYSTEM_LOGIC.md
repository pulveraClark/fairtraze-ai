# FAIR TRAZE AI — System Logic Reference

> **Source of truth policy**: this document describes the code as it exists today. Where the code differs from `CLAUDE.md`, this document notes the discrepancy explicitly and the code wins.

---

## Table of Contents

1. [Overall Data Flow](#1-overall-data-flow)
2. [GitHub Data Collection](#2-github-data-collection)
3. [Scoring Formula](#3-scoring-formula)
4. [Significance Scoring](#4-significance-scoring)
5. [Flag Rules](#5-flag-rules)
6. [Team Health (Gini)](#6-team-health-gini)
7. [AI Narrative (Gemini)](#7-ai-narrative-gemini)
8. [Auth & Roles](#8-auth--roles)
9. [Dashboard Summary Endpoint](#9-dashboard-summary-endpoint)
10. [Other Logic & Fallbacks](#10-other-logic--fallbacks)

---

## 1. Overall Data Flow

### 1.1 Analyze click → stored report

```
[Instructor clicks "Analyze"]
        │
        ▼
POST /api/projects/:id/analyze          ← server/src/routes/analyze.ts
        │
        ├── prisma.project.findUnique   ← loads Project + Members from SQLite
        │
        ├── fetchRepoStats(repoUrl)     ← server/src/lib/github.ts
        │       ├── fetchContributorStats()   → commits, additions, deletions per login
        │       ├── fetchCommitShasAndDates() → all commit SHAs + timestamps
        │       └── fetchCommitDiffs()        → line classifications, weighted additions,
        │                                       self-churn, file/impact breakdowns
        │
        ├── buildRawMembers()           ← analyze.ts (local helper)
        │       └── maps GitHub logins (case-insensitive) to DB Member records
        │           members with no GitHub match → all fields default to 0
        │
        ├── computeTeamReport()         ← shared/src/scoring.ts
        │       └── returns TeamReport: ScoredMember[], gini, teamHealth
        │
        └── prisma.report.upsert       ← saves TeamReport + preserves existing narrative
                                          stores: { report, narrative, unmatchedLogins }
                                          as JSON in Report.content
                                          also stores gini + teamHealth as top-level columns
```

**Important**: `POST /api/projects/:id/analyze` **never calls Gemini**. It preserves whatever `narrative` was in the previous Report row.

### 1.2 Narrative generation

```
[Instructor clicks "Generate explanation" or "Regenerate"]
        │
        ▼
POST /api/projects/:id/narrative[?regenerate=true]   ← analyze.ts
        │
        ├── loads latest Report row, parses content JSON
        │
        ├── if stored.narrative && !regenerate  → return { narrative, cached: true }
        │
        └── generateFairnessNarrative()          ← server/src/lib/gemini.ts
                ├── calls Gemini API with formatted prompt
                ├── saves new narrative back to Report.content
                └── returns { narrative, cached: false }
```

### 1.3 Dashboard load (read-only, no network calls to GitHub/Gemini)

```
GET /api/projects/summary    ← projects.ts
        └── reads all Project rows + latest Report per project from SQLite
            returns ProjectSummaryItem[] (no GitHub fetch, no Gemini call)

GET /api/projects/:id/report ← projects.ts
        └── reads latest Report for one project from SQLite
            returns StoredReportResponse (no GitHub fetch, no Gemini call)
```

### 1.4 Files involved end-to-end

| Step | File |
|---|---|
| HTTP routing | `server/src/index.ts` |
| Analyze + narrative endpoints | `server/src/routes/analyze.ts` |
| Projects / summary / report endpoints | `server/src/routes/projects.ts` |
| GitHub fetching | `server/src/lib/github.ts` |
| AI narrative | `server/src/lib/gemini.ts` |
| Deterministic scoring | `shared/src/scoring.ts` |
| Line classification | `shared/src/lineClassifier.ts` |
| File-type weights | `shared/src/fileWeights.ts` |
| Commit classification | `shared/src/commitClassifier.ts` |
| Database schema | `server/prisma/schema.prisma` |
| Shared types | `shared/src/types.ts` |

---

## 2. GitHub Data Collection

All fetching is in `server/src/lib/github.ts` using the Octokit REST client.

### 2.1 Step 1 — Contributor statistics

**Endpoint**: `GET /repos/{owner}/{repo}/stats/contributors`

Returns one record per contributor with:
- `author.login` — the GitHub username
- `total` — total commit count across all time
- `weeks[]` — weekly buckets, each with `a` (additions), `d` (deletions), `c` (commits)

The additions and deletions stored in `GitHubContributorData` are the sum of all weekly `a`/`d` values. These are raw line totals from GitHub's statistics cache, **not** the diff-parsed values used for scoring — the diff-parsed weighted values come from Step 3.

**202 handling (cache miss)**: GitHub returns 202 while computing stats. The function polls with a 1-second delay, up to 30 retries (`maxRetries = 30, delayMs = 1000`). After 30 attempts with no data it throws `"GitHub stats API did not return data after 30 retries"`.

### 2.2 Step 2 — Commit SHAs and dates

**Endpoint**: `GET /repos/{owner}/{repo}/commits?author={login}&per_page=100`

Paginated: loops while response length equals 100, incrementing `page`. Returns all pages.

Yields:
- `commitDates[]` — ISO timestamp strings, taken from `commit.committer.date` (falls back to `commit.author.date` if committer date is absent)
- `shas[]` — full commit SHAs, most-recent-first (GitHub's default order)

These dates drive `activeDays` and `lastPhaseRatio` in scoring.

### 2.3 Step 3 — Per-commit diffs (capped at 50)

**Endpoint**: `GET /repos/{owner}/{repo}/commits/{sha}` — called for each SHA in the sample

Cap: only the first 50 SHAs are sampled (`shas.slice(0, 50)`). If a member has more than 50 commits only the 50 most-recent are diff-sampled. The rationale (in-code comment): "to stay well within the 5000 req/hr rate limit."

Processing is done **oldest-first** (`[...shas].reverse()`) so that self-churn tracking is chronologically correct.

For each commit, for each file in the diff:
1. `categorizeFile(filename)` → determines file category and weight
2. Parse `file.patch`: collect `addedLines` (lines starting with `+`, not `++`) and count deleted lines (lines starting with `-`, not `--`)
3. Accumulate `codeLinesAdded`, `commentLinesAdded`, `blankLinesAdded` via `classifyAddedLines()`
4. Accumulate self-churn tracking (see §4.4)
5. Accumulate `commitWeightedRaw += addedLines.length × fileWeight`
6. Track file-type breakdown counts

After all files, classify the commit via `classifyCommit()` and apply:
```
weightedAdditions += commitWeightedRaw × COMMIT_IMPACT[impactClass]
```

### 2.4 Attribution — mapping GitHub logins to DB members

In `buildRawMembers()` (analyze.ts):
- A `Map<lowercase login, contributor>` is built from the GitHub data
- Each DB Member is looked up by `member.githubUsername.toLowerCase()`
- Match found → that contributor's stats are used
- No match → all numeric fields default to 0, arrays default to `[]`

GitHub contributors whose login does not match any DB member → collected in `unmatchedLogins[]` and stored in the report for the instructor to review.

### 2.5 Time window

No date filter is applied. All commits by each author across the repository's entire history are fetched. There is no start-date cutoff.

### 2.6 Zero-activity members

A member with zero GitHub commits receives:
- `commits: 0`, `additions: 0`, `deletions: 0`, `commitDates: []`
- All line counts: 0
- `weightedAdditions: 0`, `selfChurnRatio: 0`
- `activeDays: 0` (computed as `new Set([]).size`)
- Flag: **inactive** (see §5)

---

## 3. Scoring Formula

All scoring lives in `shared/src/scoring.ts`, function `computeTeamReport(rawMembers, weights)`.

### 3.1 Constants

```ts
DEFAULT_WEIGHTS = { commits: 0.4, lines: 0.4, activeDays: 0.2 }
```

### 3.2 Per-member intermediate values

```
meaningfulLines   = codeLinesAdded + 0.25 × commentLinesAdded
                    (blank lines contribute 0)

logCommits        = Math.log(commits + 1)
                    (natural log; log(1) = 0 for 0-commit members)

effectiveAdditions = weightedAdditions × (1 − 0.5 × selfChurnRatio)
                    (falls back to meaningfulLines when weightedAdditions is absent —
                     preserves compatibility with tests that predate significance scoring)

activeDays        = count of distinct YYYY-MM-DD strings in commitDates[]
```

### 3.3 Team-level totals

```
totalLogCommits         = Σ logCommits
totalEffectiveAdditions = Σ effectiveAdditions
totalActiveDays         = Σ activeDays
```

### 3.4 Per-member shares

```
commitShare    = logCommits / totalLogCommits        (0 if totalLogCommits = 0)
linesShare     = effectiveAdditions / totalEffAdditions  (0 if total = 0)
activeDaysShare = activeDays / totalActiveDays       (0 if total = 0)

contributionShare = 0.4 × commitShare
                  + 0.4 × linesShare
                  + 0.2 × activeDaysShare
```

`contributionShare` is normalized across the team (all shares sum to ≈1.0 for non-zero teams).

### 3.5 Rounding

All output fields are rounded to 3 decimal places via `round3(n) = Math.round(n * 1000) / 1000`. Gini is computed on unrounded `contributionShare` values and then rounded.

### 3.6 Worked example

3-member team, no significance data (falls back to meaningfulLines):

| Member | commits | codeLinesAdded | commentLinesAdded | activeDays |
|---|---|---|---|---|
| A | 10 | 200 | 40 | 8 |
| B | 5 | 80 | 0 | 3 |
| C | 0 | 0 | 0 | 0 |

**Step 1 — Intermediate values**
```
A: logCommits=2.398, meaningfulLines=200+0.25×40=210, activeDays=8
B: logCommits=1.792, meaningfulLines=80,               activeDays=3
C: logCommits=0,     meaningfulLines=0,                activeDays=0
```

**Step 2 — Totals**
```
totalLogCommits=4.190, totalEffective=290, totalActiveDays=11
```

**Step 3 — Shares**
```
A: commitShare=0.572, linesShare=0.724, activeDaysShare=0.727
   contributionShare = 0.4×0.572 + 0.4×0.724 + 0.2×0.727 = 0.229+0.290+0.145 = 0.664

B: commitShare=0.428, linesShare=0.276, activeDaysShare=0.273
   contributionShare = 0.4×0.428 + 0.4×0.276 + 0.2×0.273 = 0.171+0.110+0.055 = 0.336

C: commitShare=0, linesShare=0, activeDaysShare=0
   contributionShare = 0
```

**equalShare = 1/3 ≈ 0.333**

Flags:
- A: contributionShare 0.664 > 1.75 × 0.333 = 0.583 → **overload**
- B: no flags
- C: commits=0 → **inactive**

---

## 4. Significance Scoring

### 4.1 File-type weights (`shared/src/fileWeights.ts`)

`categorizeFile(filename)` applies the following rules **in priority order**:

| Priority | Category | Weight | Detection rule |
|---|---|---|---|
| 1 | `generated` | 0.0 | Exact basename in `{package-lock.json, yarn.lock, pnpm-lock.yaml}` OR path starts with `dist/`, `build/`, `.next/`, `node_modules/` OR ends with `.min.js`, `.min.css`, `.map` |
| 2 | `test` | 0.8 | Filename contains `.test.` or `.spec.` OR path matches `/__tests__/` or `/tests?/` |
| 3 | `source` | 1.0 | Extension in `{ts,tsx,js,jsx,py,java,c,cpp,cs,go,rs,rb,php,swift,kt}` |
| 4 | `docs` | 0.6 | Extension in `{md,txt,rst,adoc}` |
| 5 | `style` | 0.7 | Extension in `{css,scss,less,sass}` |
| 6 | `config` | 0.3 | Extension in `{json,yaml,yml,toml,ini,cfg}` OR basename in `{dockerfile,.gitignore,.eslintrc,.prettierrc,docker-compose.yml,docker-compose.yaml}` OR basename ends with `.env`, `.lock`, `.config.js`, `.config.ts` |
| 7 | `other` | 0.5 | Anything not matched above |

Generated files contribute 0 weighted lines and are excluded from `fileTypeBreakdown`.

### 4.2 Commit-impact multipliers (`shared/src/commitClassifier.ts`)

`classifyCommit(stats)` applies rules **in this exact order**:

| Step | Class | Multiplier | Condition |
|---|---|---|---|
| 1 | `trivial` | 0.2 | `totalLines ≤ 5` AND `!hasSourceFiles` |
| 2 | `structural` | 1.5 | `newFilesCreated ≥ 2` OR `filesChanged ≥ 5` |
| 3 | `cosmetic` | 0.5 | `!hasSourceFiles` OR (`adds/deletes ratio ∈ [0.8, 1.2]` AND `totalLines < 20`) |
| 4 | `functional` | 1.0 | Default (substantive source-file change) |

`hasSourceFiles` is true if any file in the commit belongs to the `source` or `test` category.

The `adds/deletes` ratio is `additions / deletions`; if `deletions = 0` the ratio is `Infinity`, which falls outside `[0.8, 1.2]`, so that path does not classify as cosmetic.

### 4.3 How weighted additions are computed per commit

```
commitWeightedRaw = 0
for each file in commit:
    addedLineCount = count of lines in patch starting with "+" (not "++")
    commitWeightedRaw += addedLineCount × getFileWeight(filename)

impactClass = classifyCommit(commitStats)
weightedAdditions += commitWeightedRaw × COMMIT_IMPACT[impactClass]
```

The impact multiplier is applied at the commit level (whole commit gets one class), not per-file.

### 4.4 Line classification (`shared/src/lineClassifier.ts`)

`classifyAddedLines(filename, addedLines[])` classifies each line:

1. Trim the line from the left
2. If trimmed length = 0 → **blank**
3. If the language has comment markers AND trimmed line starts with one → **comment**
4. Otherwise → **code**

Language marker table:

| Marker | Extensions |
|---|---|
| `//` or `/*` | js, ts, jsx, tsx, java, c, cpp, cs, go, rs |
| `#` | py, rb, sh, yaml, yml |
| `<!--` | html, xml |
| `--` | sql, lua |
| `/*` | css, scss, less |

For unknown extensions, no markers are defined — all non-blank lines count as **code**.

`meaningfulLines = codeLinesAdded + 0.25 × commentLinesAdded`

Blank lines contribute zero. The 0.25 weight means 4 comment lines equal 1 code line.

### 4.5 Self-churn (`server/src/lib/github.ts`)

Self-churn tracks how many lines **this member** added to a file that **this member** later deleted (within the 50-commit sample, processed oldest-first).

Per-file running tally (`fileAddedLines: Map<filename, number>`):

```
for each commit (oldest-first):
    for each file:
        priorAdded  = fileAddedLines.get(filename) ?? 0
        selfDeleted = min(patchDeletedCount, priorAdded)
        selfDeletedTotal       += selfDeleted
        totalAdditionsForChurn += addedLines.length
        fileAddedLines.set(filename, max(0, priorAdded - selfDeleted) + addedLines.length)

selfChurnRatio = selfDeletedTotal / totalAdditionsForChurn
                 (0 if totalAdditionsForChurn = 0)
```

This only fires when the **same committer** deletes lines they previously added. Deleting another member's lines does not affect self-churn.

The penalty in scoring:
```
effectiveAdditions = weightedAdditions × (1 − 0.5 × selfChurnRatio)
```

Maximum penalty: `selfChurnRatio = 1` → `effectiveAdditions = 0.5 × weightedAdditions`. The penalty never zeroes out contribution.

---

## 5. Flag Rules

All flag logic is in `shared/src/scoring.ts`, inside `computeTeamReport()`. The `flags[]` array on each `ScoredMember` is the authoritative output.

```ts
const equalShare = 1 / memberCount;
```

| Flag | Exact condition |
|---|---|
| `inactive` | `commits === 0` |
| `free-rider` | `commits > 0` AND `contributionShare < 0.5 × equalShare` |
| `deadline-driven` | `commits > 0` AND `lastPhaseRatio > 0.6` |
| `overload` | `contributionShare > 1.75 × equalShare` |

**Mutual exclusivity**: `inactive` and `free-rider` are mutually exclusive. The free-rider check is inside the `else` branch of the `commits === 0` check:
```ts
if (m.commits === 0) {
    flags.push("inactive");
} else {
    if (m.contributionShare < FREE_RIDER_THRESHOLD * equalShare) flags.push("free-rider");
    if (m.lastPhaseRatio > DEADLINE_DRIVEN_THRESHOLD) flags.push("deadline-driven");
}
if (m.contributionShare > OVERLOAD_THRESHOLD * equalShare) flags.push("overload");
```

`overload` is checked outside the if/else block, so an `inactive` member can theoretically also be flagged `overload` if their `contributionShare` is above the threshold. In practice this can't happen because an inactive member has contributionShare = 0, which cannot exceed 1.75 × equalShare for any team with more than one member.

### 5.1 lastPhaseRatio computation

The last-phase boundary is derived from the **entire team's** commit timestamps, not per-member:

```ts
allTimestamps = all commitDates from all members, converted to epoch ms
minTime = min(allTimestamps)
maxTime = max(allTimestamps)
span    = maxTime - minTime

if span > 0:
    phaseStart = minTime + (2/3) × span   // last third of the timeline

for each member:
    inLastPhase = count of member's commit timestamps >= phaseStart
    lastPhaseRatio = inLastPhase / total member commits
```

If `span = 0` (all commits have the same timestamp) or the member has no commits, `lastPhaseRatio = 0`.

**Note**: the timeline window is the observed commit range (`minTime` to `maxTime`), not a fixed assignment deadline. A fixed-deadline anchor is a designed improvement documented in `CLAUDE.md` but not yet implemented in the code.

---

## 6. Team Health (Gini)

### 6.1 Gini formula (`shared/src/scoring.ts`, function `gini()`)

```ts
gini(values: number[]): number {
    n     = values.length
    total = sum(values)
    if n === 0 || total === 0: return 0

    sum = 0
    for i in 0..n-1:
        for j in 0..n-1:
            sum += |values[i] - values[j]|

    return sum / (2 × n × total)
}
```

This is the standard mean absolute difference formula. For two members with shares [0.9, 0.1]:
```
|0.9−0.9| + |0.9−0.1| + |0.1−0.9| + |0.1−0.1| = 0 + 0.8 + 0.8 + 0 = 1.6
gini = 1.6 / (2 × 2 × 1.0) = 0.4
```

Gini is computed on **unrounded** contributionShares, then rounded to 3 decimal places for storage.

### 6.2 Band thresholds

| Label | Condition |
|---|---|
| `Healthy` | gini < 0.2 |
| `Moderate Risk` | 0.2 ≤ gini < 0.4 |
| `High Risk` | gini ≥ 0.4 |

These are stored in two places:
- `Report.teamHealth` (String column) — used by the summary endpoint
- `content` JSON `report.teamHealth` — used by the detail endpoint

---

## 7. AI Narrative (Gemini)

All narrative logic is in `server/src/lib/gemini.ts`.

### 7.1 Model

```ts
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
```

The model is configurable via the `GEMINI_MODEL` env var; if not set, it defaults to `"gemini-2.5-flash-lite"`. The API client is `@google/genai` (`GoogleGenAI`).

**Startup guard**: if `GEMINI_API_KEY` is not set, the module throws at import time and the server fails to start.

### 7.2 Prompt structure

`formatPrompt(projectName, teamReport)` produces a plain-text document passed as `contents` (user turn). The `systemInstruction` is passed separately in the config.

The user prompt includes:
- `Project: <name>`
- `Team health: <label>`
- `Gini coefficient: <value to 3 decimal places>`
- `Team size: N members (equal share = X% each)`
- For each member:
  - Name and GitHub username
  - `Contribution share: X% (equal share for this team: Y%)`
  - `Commits: N | Active days: N | Churn: N lines` (churn = additions + deletions)
  - `Flags: none` OR `Flags: flag1, flag2`

The `Flags:` line explicitly says `"none"` (not `"[]"`) when there are no flags. This is an intentional guard to prevent the model from misreading an empty array and inventing flags from the numbers.

### 7.3 System instruction constraints (exact rules in the code)

The system instruction enforces four hard rules:

1. **FLAGS ARE THE SINGLE SOURCE OF TRUTH** — the `Flags:` field is authoritative. If it says `none`, no flag may be mentioned or implied. No flags may be added, removed, or renamed.
2. **NO THRESHOLDS, NO MATH** — threshold values must never be stated, referenced, estimated, or implied. No computation or comparison may be described.
3. **NO CONTRADICTIONS** — the narrative must be consistent with `teamHealth`, the Gini value, and every member's flags exactly as provided.
4. **Structure** — flowing prose only (no headers, no bullet points):
   1. One sentence: project name + teamHealth label
   2. One paragraph per flagged member: name, contributionShare%, commits, named flag(s) in plain English. Omit this section entirely if no flags.
   3. One sentence: Gini value + plain-language description
   4. One sentence: reminder that this supports but does not replace instructor judgment

### 7.4 Caching behavior

Endpoint: `POST /api/projects/:id/narrative`

| Condition | Behavior |
|---|---|
| `stored.narrative` exists AND `?regenerate=true` not set | Return `{ narrative, cached: true }` immediately — no Gemini call |
| `?regenerate=true` set | Always call Gemini regardless of cached value |
| No stored narrative | Always call Gemini |
| Gemini call succeeds | Save new narrative to `Report.content`, return `{ narrative, cached: false }` |
| Gemini call fails AND cached narrative exists | Return `{ narrative, cached: true, warning: "Generation failed; showing previously saved narrative." }` |
| Gemini call fails AND no cached narrative | Return `503 { error: "AI explanation temporarily unavailable — showing computed results." }` |

### 7.5 Rate-limit handling (429)

```ts
if (e.status === 429) {
    const match = (e.message ?? "").match(/(\d+)\s*s/i);
    const delayMs = match ? parseInt(match[1], 10) * 1000 : 5000;
    await sleep(delayMs);
    return callOnce(...); // one retry, then propagate if it fails again
}
```

The function tries to parse a seconds value from the error message. If none is found, it waits 5 seconds. Only one retry is attempted; if the retry fails, the error propagates to the caller (which applies the graceful-degradation logic in §7.4).

### 7.6 Analyze does NOT touch the narrative

`POST /api/projects/:id/analyze` (analyze.ts) explicitly preserves the existing narrative when upserting:

```ts
const savedNarrative = stored.narrative ?? null;
await prisma.report.update({
    data: { content: JSON.stringify({ report, narrative: savedNarrative, unmatchedLogins }) }
});
```

Re-analyzing does not regenerate or clear the narrative. The narrative only changes when the `/narrative` endpoint is explicitly called.

---

## 8. Auth & Roles

### 8.1 Database model (`server/prisma/schema.prisma`)

```prisma
enum SystemRole { ADMIN  INSTRUCTOR  STUDENT }

model User {
  id             Int        @id @default(autoincrement())
  email          String     @unique
  passwordHash   String
  name           String
  systemRole     SystemRole @default(STUDENT)
  githubUsername String?    // nullable; self-registered via settings
  createdAt      DateTime   @default(now())
}
```

### 8.2 JWT (`server/src/lib/jwt.ts`)

```ts
SECRET = process.env.AUTH_SECRET   // throws at startup if not set

signToken(payload: JwtPayload): string
    → jwt.sign(payload, SECRET, { expiresIn: "7d" })

verifyToken(token: string): JwtPayload
    → jwt.verify(token, SECRET)    // throws on invalid or expired token
```

JWT payload shape:
```ts
{ sub: number; email: string; name: string; role: SystemRole }
```

Token lifetime: **7 days**.

### 8.3 Password hashing

Library: `bcryptjs` (pure-JS drop-in for `bcrypt`).
Cost factor: **10** (`bcrypt.hash(password, 10)`).

> **Discrepancy with CLAUDE.md**: `CLAUDE.md` refers to `bcrypt`; the code uses `bcryptjs`. The API is identical.

### 8.4 Auth endpoints (`server/src/routes/auth.ts`)

| Endpoint | Logic |
|---|---|
| `POST /api/auth/register` | Zod: email (valid), password (min 8), name (min 1), role? (enum). Duplicate email → 409. Hash password (cost 10), create User with role (default: STUDENT), return `{ token, user: {id,email,name,systemRole} }` with status 201. |
| `POST /api/auth/login` | Zod: email, password (min 1). User not found → 401 with generic message. `bcrypt.compare` fails → 401 with same generic message (no email-exists leak). Success → `{ token, user }`. |
| `POST /api/auth/logout` | Stateless; returns `{ message: "Logged out successfully" }`. Server holds no session state. |
| `GET /api/auth/me` | `authenticateToken` middleware. If no `req.user` → 401. Re-fetches user from DB (ensures fresh data). Returns `{ id, email, name, systemRole, githubUsername, createdAt }` — **excludes** `passwordHash`. |

### 8.5 Auth middleware (`server/src/middleware/auth.ts`)

Three exports:

**`authenticateToken`** — reads `Authorization: Bearer <token>`, calls `verifyToken`, attaches result to `req.user`. Invalid or missing token → `req.user` stays `undefined`, `next()` is still called (non-blocking).

**`requireAuth`** — composes `authenticateToken` + a check: if `req.user` is absent after token processing, returns `401 { error: "Authentication required" }`.

**`requireRole(...roles)`** — returns a two-middleware array: first `requireAuth`, then a role check that returns `403 { error: "Insufficient permissions" }` if `req.user.role` is not in the allowed list.

**Current scope**: `requireAuth` and `requireRole` are defined but **not applied** to `analyzeRouter` or `projectsRouter`. All analyze, summary, and report endpoints are currently public. Only `PATCH /api/users/me` and `POST /api/users/me/password` (usersRouter) use `requireAuth`.

> **Discrepancy with CLAUDE.md**: CLAUDE.md (Phase A) notes that per-instructor data scoping and `requireAuth` on analyze/summary/narrative endpoints are deferred to Phase B. The code confirms these endpoints are still unprotected.

### 8.6 User profile endpoints (`server/src/routes/users.ts`)

| Endpoint | Logic |
|---|---|
| `PATCH /api/users/me` | `requireAuth`. Zod validates optional `name` (min 1) and optional nullable `githubUsername` (min 1 if set). Updates the authenticated user. Role and email are **not** self-editable. |
| `POST /api/users/me/password` | `requireAuth`. Zod: `currentPassword` (min 1), `newPassword` (min 8). Verifies `currentPassword` via `bcrypt.compare`. Updates `passwordHash`. |

### 8.7 Client-side auth (`client/src/context/AuthContext.tsx`)

Token storage: `localStorage` key `"ft_auth_token"`.

On app mount: reads the stored token, calls `GET /api/auth/me` to validate. If the call fails (expired/invalid/removed), clears the token. Sets `loading = false` when done.

`login()` / `register()` → stores token in localStorage + in context state.

`logout()` → fires `POST /api/auth/logout` (fire-and-forget), removes token from localStorage, clears context state.

`refreshUser()` → re-fetches `/api/auth/me` and updates the user object in context (used after profile edits).

### 8.8 Role-based routing (`client/src/App.tsx` + `ProtectedRoute.tsx` + `LoginPage.tsx`)

`ProtectedRoute` behavior:
- While `loading` is true: shows a spinner
- Not logged in: saves `pathname` in `localStorage` key `"ft_next"`, redirects to `/login`
- Logged in but wrong role: redirects to the role's home (`roleHome(role)`)

`roleHome` mapping:
```ts
STUDENT    → "/student"
ADMIN      → "/admin"
INSTRUCTOR → "/dashboard"  (default for any other role)
```

Route → allowed roles:

| Route | Allowed roles |
|---|---|
| `/dashboard` | INSTRUCTOR |
| `/project/:id` | INSTRUCTOR |
| `/class/:label` | INSTRUCTOR |
| `/class/:label/assignment/:id` | INSTRUCTOR |
| `/admin` | ADMIN |
| `/student` | STUDENT |
| `/student/class/:code` | STUDENT |
| `/settings` | any authenticated user (no `allowedRoles` constraint) |
| `/login`, `/register`, `/overview`, `/` | public |

After successful login: if `"ft_next"` is set in localStorage, navigates there (restores the interrupted destination). Otherwise navigates to the role home. `LoginPage` also auto-redirects already-authenticated users away from `/login`.

> **Discrepancy with CLAUDE.md**: CLAUDE.md describes Google OAuth as the primary sign-in method. The code implements email/password only. Google OAuth is not present in any file.

---

## 9. Dashboard Summary Endpoint

`GET /api/projects/summary` (`server/src/routes/projects.ts`)

### 9.1 What it reads

Single Prisma query: all `Project` rows with their `Member[]` and the single most-recently-generated `Report` (ordered by `generatedAt` descending, `take: 1`).

**No GitHub fetch. No Gemini call.** All values come from the database.

### 9.2 What each ProjectSummaryItem contains

| Field | Source |
|---|---|
| `projectId` | `Project.id` |
| `groupName` | `Project.groupName` (fallback: `"Group {id}"` if empty string) |
| `name` | `Project.name` |
| `assignmentLabel` | `Project.assignmentLabel` (fallback: `"General Assignment"` if empty string) |
| `memberCount` | `Project.members.length` (DB member count, not from the report) |
| `teamHealth` | `Report.teamHealth` cast to `TeamHealth \| null` (null if no report) |
| `gini` | `Report.gini` (null if no report) |
| `memberShares` | `report.members.map(m => { studentName, contributionShare, flags })` (empty array if no report) |
| `flagsPresent` | Deduplicated union of all member flags across the team (empty if no report) |
| `lastAnalyzedAt` | `Report.generatedAt.toISOString()` (null if no report) |
| `isAnalyzed` | `true` if a Report row exists, `false` otherwise |

### 9.3 Risk roll-up

There is no server-side risk roll-up computation. The summary endpoint returns raw per-group data. Risk aggregation (e.g., "at-risk groups in a class") is performed client-side by the dashboard components reading `teamHealth` and `flagsPresent` from the summary array.

The `AdminPage.tsx` at `/admin` shows a hardcoded sample dataset — it is **not** driven by a live `/api/admin/...` endpoint. Institution-level analytics are a designed future feature (Phase F) not yet implemented.

---

## 10. Other Logic & Fallbacks

### 10.1 Server startup guards

| Guard | Location | Behavior |
|---|---|---|
| `GEMINI_API_KEY` missing | `server/src/lib/gemini.ts` top-level | Throws at module import; server fails to start |
| `AUTH_SECRET` missing | `server/src/lib/jwt.ts` top-level | Throws at module import; server fails to start |
| `GITHUB_TOKEN` missing | `server/src/routes/analyze.ts`, inside the route handler | Returns `500 { error: "GITHUB_TOKEN is not set" }` at analyze time; does not prevent startup |

### 10.2 Report content JSON structure

The `Report.content` column stores a JSON string with this shape:

```json
{
  "report": { ...TeamReport... },
  "narrative": "string or null",
  "unmatchedLogins": ["login1", "login2"]
}
```

`Report.gini` and `Report.teamHealth` are also stored as separate top-level columns (Float? and String?) for efficient querying by the summary endpoint without parsing JSON.

### 10.3 Unmatched GitHub logins

When the GitHub API returns commits from contributors whose login does not match any DB member (case-insensitive), those logins are collected in `unmatchedLogins[]` and saved in `Report.content`. The detail page (`StoredReportResponse.unmatchedGitHubLogins`) surfaces them to the instructor as an amber warning banner.

### 10.4 Upsert behavior on re-analyze

The analyze endpoint checks for an existing Report row:
- **Row exists**: updates `generatedAt`, `gini`, `teamHealth`, and `content` — preserving the existing narrative.
- **No row**: creates a fresh Report with `narrative: null`.

There is at most one Report row per project in practice (the query finds the most recent, updates it in place). Multiple Report rows per project are technically possible via the schema but the current logic does not create them after the first analysis.

### 10.5 codeToCommentRatio

Computed in `scoring.ts` and stored on `ScoredMember`:
```ts
codeToCommentRatio = codeLinesAdded / commentLinesAdded   (rounded to 3 dp)
                     null if commentLinesAdded === 0
```

This is a diagnostic signal surfaced in the member table. It is **not** used in scoring.

### 10.6 commitImpactBreakdown and fileTypeBreakdown

Both are stored on `ScoredMember` as count objects:
- `commitImpactBreakdown: { structural, functional, cosmetic, trivial }` — number of commits of each class
- `fileTypeBreakdown: { source, test, docs, style, config, other }` — number of added lines by category (generated files excluded)

These are diagnostic/display fields. They do not feed back into `contributionShare`.

### 10.7 Seed data

`server/prisma/seed.ts` upserts 5 projects and 2 dev auth users:

| id | groupName | App name | Assignment label |
|---|---|---|---|
| 1 | Group 1 | FairTraze AI | CC-APPSDEV22 — Applications Development |
| 2 | Group 2 | PersonalFinanceTracker | IT-IMDBSYS32 — Information Management 2 (Database Systems) |
| 3 | Group 3 | uConnect | IT-ELEC 2 — IT Elective 2 |
| 4 | PorkChop | Porkhub | CC-APPSDEV22 — Applications Development |
| 5 | SmartBebe | SkillSmart | IT-IMDBSYS32 — Information Management 2 (Database Systems) |

Dev auth users:
- `instructor@fairtraze.dev` / `instructor123` — role `INSTRUCTOR`
- `admin@fairtraze.dev` / `admin123` — role `ADMIN`

> **Discrepancy with CLAUDE.md**: CLAUDE.md says "the seed populates both for all three demo projects." The code seeds 5 projects across 3 assignment labels (CC-APPSDEV22 has 2 groups, IT-IMDBSYS32 has 2 groups, IT-ELEC 2 has 1 group). The "three" may refer to the three assignment labels (classes), not the project count.

### 10.8 Custom router

The client uses a custom history-API router (`client/src/router.ts`), not react-router-dom. `navigate(to)` calls `history.pushState(null, "", to)` and updates the React state. Route resolution is handled by pattern matching in `App.tsx`. `resolvePathname()` validates the path against known patterns and falls back to `"/"` for any unknown path.
