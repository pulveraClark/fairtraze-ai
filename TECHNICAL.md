# FAIR TRAZE AI — Technical Reference

This document is sourced entirely from the actual code. Every version number, formula, threshold, and design note is pulled from the real files. Where something is not found in code, that is stated explicitly.

---

## 1. Tech Stack & Dependencies

### Monorepo Root

| Item | Version | Why |
|---|---|---|
| npm workspaces | built-in | Lets `client`, `server`, and `shared` share one `node_modules` and cross-reference each other by package name without publishing. |
| concurrently | ^9.1.2 | Runs `dev:server` and `dev:client` in one terminal with a single `npm run dev`. |
| TypeScript | ^5.8.3 | Shared across all three packages so types defined in `shared/` are enforced in both `client/` and `server/` at compile time. |

### Client (`@fairtraze/client`)

| Item | Version | Why |
|---|---|---|
| React | ^19.1.0 | Component-based UI for the instructor dashboard. |
| Vite | ^6.3.5 | Fast dev server with HMR; proxies `/api` to the server so no CORS issues in development. |
| Tailwind CSS | ^4.1.7 (via `@tailwindcss/vite`) | Utility-first styling; v4 integrates as a Vite plugin so no separate config file is needed. |
| Recharts | ^3.8.1 | Declarative bar chart for contribution shares; chosen for its straightforward React integration. |
| react-markdown | ^10.1.0 | Renders the Gemini narrative (plain prose) as formatted HTML without writing a custom parser. |
| TypeScript | ^5.8.3 | Same version as server and shared to ensure compatible type definitions. |

### Server (`@fairtraze/server`)

| Item | Version | Why |
|---|---|---|
| Express | ^5.1.0 | Minimal HTTP server; v5 has native async error handling so no need for `try/catch` wrappers on every route. |
| Prisma | ^6.7.0 | ORM with auto-generated TypeScript client; schema migrations are versioned. |
| SQLite (via Prisma) | — | Zero-setup file-based database; appropriate for a single-instructor prototype with no concurrent write load. |
| @octokit/rest | ^21.0.2 | Official GitHub REST API client; handles authentication headers and pagination. |
| @google/genai | ^2.8.0 | Official Google Generative AI SDK; used to call Gemini for the fairness narrative. |
| zod | ^3.24.2 | Validates and coerces the `:id` path parameter on the analyze route before any database call. |
| dotenv | ^16.4.7 | Loads `server/.env` so `GITHUB_TOKEN`, `GEMINI_API_KEY`, and `DATABASE_URL` are available as environment variables. |
| tsx | ^4.19.1 | Runs TypeScript directly in development (`tsx watch src/index.ts`) without a compile step. |
| cors | ^2.8.5 | Allows the Vite dev server (port 5173) to call the API server (port 3001) during development. |

### Shared (`@fairtraze/shared`)

| Item | Version | Why |
|---|---|---|
| TypeScript | ^5.8.3 | Types and scoring logic are written once here and imported by both client and server. |
| vitest | ^3.0.0 | Runs the deterministic scoring tests; chosen because it shares the same config format as Vite. |

---

## 2. Architecture & Data Flow

The system has three packages that communicate in two ways: through shared TypeScript types (compile-time) and through HTTP (runtime).

**Ports.** The client Vite dev server runs on **port 5173**. The Express API server runs on **port 3001** (or the value of the `PORT` environment variable). The Vite config proxies any request starting with `/api` to `http://localhost:3001`, so the client only ever calls relative URLs like `/api/projects`.

**Request flow for a fairness report.**

1. On load, the client fetches `GET /api/projects` and populates the project dropdown.
2. The instructor selects a project and clicks Analyze.
3. The client POSTs `POST /api/projects/:id/analyze`.
4. The server looks up the project (name, repo URL) and its member roster from SQLite.
5. The server calls the GitHub Stats API (`GET /repos/{owner}/{repo}/stats/contributors`) via Octokit to get per-contributor commit counts, additions, and deletions. This endpoint returns 202 while GitHub computes the data; the server retries up to 30 times with a 1-second delay.
6. For each contributor, the server fetches all commit SHAs and dates (`GET /repos/{owner}/{repo}/commits`, paginated at 100 per page).
7. The server samples the first 50 SHAs per contributor and calls `GET /repos/{owner}/{repo}/commits/{sha}` for each, parses the diff patch, and classifies every added line as code, comment, or blank using `classifyAddedLines()` from `shared/src/lineClassifier.ts`.
8. GitHub contributor logins are matched (case-insensitively) to the seeded member roster. Unmatched logins are collected separately.
9. `computeTeamReport()` in `shared/src/scoring.ts` runs the deterministic scoring pipeline and returns a `TeamReport`.
10. `generateFairnessNarrative()` in `server/src/lib/gemini.ts` sends the `TeamReport` JSON to Gemini and gets back a prose explanation.
11. The report (gini, teamHealth, full JSON content) is persisted to the `Report` table in SQLite.
12. The server returns an `AnalyzeResponse` JSON to the client.
13. The client renders the team-health banner, bar chart, member table, and AI narrative.

**Why this design.** Scoring is kept entirely in `shared/` and runs on the server so that the numbers reaching the AI and the UI are identical and auditable. The AI only receives already-computed numbers and is only asked to explain them in prose — it cannot change them. This separation is a core design requirement from the project's capstone paper (the "math scores; the AI explains" principle).

---

## 3. Data Model

Defined in `server/prisma/schema.prisma`. Database: SQLite.

### `Project`

| Field | Type | Notes |
|---|---|---|
| `id` | Int, autoincrement PK | — |
| `name` | String | Display name shown in the dropdown. |
| `repoUrl` | String | GitHub URL; parsed by the server to extract `owner/repo`. |
| `createdAt` | DateTime, default now | — |
| `members` | Member[] | One project has many members. |
| `reports` | Report[] | One project can have many generated reports. |

### `Member`

| Field | Type | Notes |
|---|---|---|
| `id` | Int, autoincrement PK | — |
| `projectId` | Int, FK → Project | — |
| `studentName` | String | Display name for the instructor. |
| `githubUsername` | String | Matched against GitHub contributor logins (case-insensitive). |

**Why:** Members are seeded rather than self-registered in this prototype. The designed flow would have each member self-register their own GitHub username, but that requires login/roles which are out of scope.

### `Report`

| Field | Type | Notes |
|---|---|---|
| `id` | Int, autoincrement PK | — |
| `projectId` | Int, FK → Project | — |
| `generatedAt` | DateTime, default now | — |
| `gini` | Float? (nullable) | The Gini coefficient stored for quick retrieval. |
| `teamHealth` | String? (nullable) | "Healthy", "Moderate Risk", or "High Risk". |
| `content` | String? (nullable) | Full `{ report, narrative }` JSON blob for archiving. |

**Why the full JSON blob:** The structured `TeamReport` and the narrative are stored together so a past report can be replayed without re-fetching GitHub. No separate `NarrativeText` table is needed at this scale.

---

## 4. Scoring & Formulas

All of the following is implemented in `shared/src/scoring.ts`. These values are constants in code — not configuration.

### Weights (`DEFAULT_WEIGHTS`)

```
commits:    0.4
lines:      0.4   ← applied to meaningfulLines share (renamed from churn)
activeDays: 0.2
```

**Why these weights:** Commits and meaningful lines are weighted equally (0.4 each) because both frequency and code substance matter. Active days gets a lower weight (0.2) because a member who commits all work in two large sessions should not be penalized relative to one who makes small daily commits.

### Component Shares (all normalized to [0, 1] across the team)

```
commitShare    = member.commits / sum(all commits)
linesShare     = member.meaningfulLines / sum(all meaningfulLines)
activeDaysShare = member.activeDays / sum(all activeDays)
```

- `activeDays` = count of distinct calendar days (YYYY-MM-DD) that appear in the member's commit timestamps.
- If a total is zero (e.g., no commits at all), the corresponding share is 0.

### Meaningful Lines Formula

```
meaningfulLines = codeLinesAdded + 0.25 * commentLinesAdded
```

- `codeLinesAdded`, `commentLinesAdded`, and `blankLinesAdded` come from parsing the actual diff patches of up to 50 commits per member.
- Blank lines contribute **zero** to `meaningfulLines`. This prevents large formatting-only commits from inflating a member's line score.
- Comments contribute at 25% of full weight. They are recognized effort but less than substantive code.
- `codeToCommentRatio = codeLinesAdded / commentLinesAdded` (null when `commentLinesAdded === 0`).

**Why:** Raw additions + deletions (churn) counted whitespace and reformatting equally with logic. Classifying lines by type and discounting comments/blanks makes the line-magnitude signal reflect actual code contribution more accurately.

### Contribution Score

```
contributionShare = 0.4 × commitShare + 0.4 × linesShare + 0.2 × activeDaysShare
```

All values are rounded to 3 decimal places in the output.

### Flags

Each member's `contributionShare` is compared to `equalShare = 1 / memberCount`.

| Flag | Condition | Threshold constant |
|---|---|---|
| `inactive` | `commits === 0` | — |
| `free-rider` | `commits > 0` AND `contributionShare < 0.5 × equalShare` | `FREE_RIDER_THRESHOLD = 0.5` |
| `overload` | `contributionShare > 1.75 × equalShare` | `OVERLOAD_THRESHOLD = 1.75` |
| `deadline-driven` | `lastPhaseRatio > 0.6` (and `commits > 0`) | `DEADLINE_DRIVEN_THRESHOLD = 0.6` |

**`lastPhaseRatio`** — what fraction of a member's commits fall in the final third of the project timeline:
- Timeline span = max(commitTimestamps) − min(commitTimestamps) across all members.
- `phaseStart = minTime + (2/3) × span`
- `lastPhaseRatio = commits after phaseStart / total commits for that member`
- If the span is zero (all commits on the same day), `lastPhaseRatio = 0` and the flag cannot fire.

**Why these thresholds:** 0.5× equal share is the point where a member's contribution is less than half what a perfectly balanced team member would contribute — a meaningful deficit. 1.75× flags one person doing nearly double their fair share. 0.6 means more than 60% of commits are in the last third of the project — evidence of deadline-driven pattern rather than steady contribution.

### Gini Coefficient

```
gini(values) = Σ|vi − vj| / (2 × n × total)
```

Summed over all ordered pairs (i, j), including i=j (which contributes 0). Computed on the unrounded `contributionShare` values.

**Why Gini:** It is a standard, well-understood measure of statistical inequality. A Gini of 0 means perfectly equal shares; 1 means one member did everything. It is interpretable without domain knowledge.

### Team Health Bands

| Label | Condition |
|---|---|
| `Healthy` | gini < 0.2 |
| `Moderate Risk` | 0.2 ≤ gini < 0.4 |
| `High Risk` | gini ≥ 0.4 |

Constants: `HEALTHY_GINI_THRESHOLD = 0.2`, `MODERATE_RISK_GINI_THRESHOLD = 0.4`.

### Why the AI Does Not Compute These

The scores, flags, Gini, and team health are computed deterministically before the AI is called. The AI receives the finished `TeamReport` JSON and is only asked to write a plain-language explanation. This means the numbers are reproducible, auditable, and not subject to model variability. The AI cannot accidentally change a threshold or assign a different contribution share by rephrasing. This separation is enforced in code: `computeTeamReport()` runs in `shared/`, Gemini is called afterward in `server/src/lib/gemini.ts`, and the AI output is only used as the `narrative` string — never fed back into scoring.

---

## 5. API Endpoints

Server base URL (dev): `http://localhost:3001`

### `GET /health`

Health check. No auth required.

**Response:**
```json
{ "status": "ok", "timestamp": "2024-01-01T00:00:00.000Z" }
```

---

### `GET /api/projects`

Returns all projects and their members, ordered by `id` ascending.

**Response:**
```json
{
  "projects": [
    {
      "id": 1,
      "name": "FairTraze AI",
      "repoUrl": "https://github.com/owner/repo",
      "createdAt": "...",
      "members": [
        { "id": 1, "projectId": 1, "studentName": "...", "githubUsername": "..." }
      ]
    }
  ]
}
```

**Why:** The client loads this on startup to populate the project dropdown without any user interaction.

---

### `POST /api/projects/:id/analyze`

Triggers the full analysis pipeline for project `:id`. No request body required.

**Success response (200):** `AnalyzeResponse`

```json
{
  "projectId": 1,
  "repoUrl": "https://github.com/owner/repo",
  "analyzedAt": "ISO timestamp",
  "unmatchedGitHubLogins": ["login-not-in-roster"],
  "report": {
    "memberCount": 5,
    "gini": 0.312,
    "teamHealth": "Moderate Risk",
    "members": [
      {
        "studentName": "...",
        "githubUsername": "...",
        "commits": 42,
        "additions": 1800,
        "deletions": 400,
        "churn": 2200,
        "activeDays": 14,
        "lastPhaseRatio": 0.238,
        "commitShare": 0.35,
        "linesShare": 0.41,
        "activeDaysShare": 0.28,
        "contributionShare": 0.368,
        "codeLinesAdded": 950,
        "commentLinesAdded": 120,
        "blankLinesAdded": 88,
        "codeToCommentRatio": 7.917,
        "flags": []
      }
    ]
  },
  "narrative": "Plain-prose AI explanation..."
}
```

**Error responses:**
- `400` — non-integer or non-positive `:id`
- `404` — project not in database, or GitHub repo not found / token lacks access
- `429` — GitHub rate limit exceeded (403 or 429 from GitHub)
- `502` — any other GitHub API failure
- `500` — `GITHUB_TOKEN` not set in environment

Each error body is `{ "error": "message" }`, with an optional `"detail"` or `"repoUrl"` field.

---

## 6. AI Integration

**Provider:** Google Gemini via `@google/genai` v2.8.0  
**Model:** `gemini-2.5-flash` (exact model ID used in the `generateContent` call)  
**SDK call:**
```typescript
const ai = new GoogleGenAI({ apiKey });
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: `Project: ${projectName}\n\nTeam Report:\n${JSON.stringify(teamReport, null, 2)}`,
  config: { systemInstruction: SYSTEM_INSTRUCTION },
});
return response.text ?? "";
```

**What is sent:** The project name and the full `TeamReport` object serialized as pretty-printed JSON (all computed scores, shares, flags, Gini, and team health).

**What is returned:** A plain prose string (`response.text`).

**System instruction (verbatim from `server/src/lib/gemini.ts`):**

> You are an assistant helping an instructor assess team contribution fairness in a software project. Write an evidence-based contribution fairness report using only the statistics provided — never change the numbers, never assign grades, never speculate beyond what the data shows.
>
> Structure your response exactly as follows:
> 1. One sentence introducing the project and its overall team health.
> 2. One short paragraph per team member who has at least one flag. For each flagged member, cite their specific commits, churn (additions + deletions), contributionShare, and state which flag fired and precisely why (reference the threshold that triggered it).
> 3. One sentence summarising the team Gini coefficient and what it means in plain language.
> 4. One closing sentence reminding the instructor that this report supports but does not replace their own judgment.
>
> Tone: fair, factual, non-accusatory. Do not use words like "lazy", "cheating", or "unfair". Do not add headers or bullet points — write in flowing prose.

**Why Gemini only explains and never computes:** The scores, flags, and Gini reach the AI as read-only inputs. The AI is explicitly instructed not to change the numbers or assign grades. If the Gemini call fails (missing key, network error, API error), the server falls back to a static string: *"AI narrative unavailable — please review the statistics directly."* The report is saved and returned either way. This means scoring results are never blocked by AI availability.

---

## 7. Configuration

All configuration is via environment variables. In development, place these in `server/.env`.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Prisma SQLite connection string. Example: `file:./prisma/dev.db` |
| `GITHUB_TOKEN` | Yes | GitHub personal access token. Needed for authenticated API calls (5 000 requests/hr limit). Without it the server returns 500 on analyze. |
| `GEMINI_API_KEY` | No | Google Gemini API key. If absent, the narrative falls back to a static message; scoring still runs. |
| `PORT` | No | HTTP port for the Express server. Defaults to `3001`. |

The client has no runtime environment variables. Its only configuration is the Vite proxy in `client/vite.config.ts`, which points `/api` at `http://localhost:3001`.

---

## 8. How to Run

**Prerequisites:** Node.js (v18 or later), npm.

```bash
# 1. Install all workspace dependencies
npm install

# 2. Apply the Prisma schema to create the SQLite database
npm run db:migrate

# 3. Seed demo projects and members
npm run db:seed

# 4. Start both server and client in one terminal
npm run dev
```

- Server: `http://localhost:3001`
- Client: `http://localhost:5173`

**Run only server or client:**
```bash
npm run dev:server   # Express + tsx watch on port 3001
npm run dev:client   # Vite on port 5173
```

**Run tests (shared scoring module only):**
```bash
npm test
```

**Regenerate Prisma client after schema changes:**
```bash
npm run db:generate
```

**Seed data (3 projects, 10 members total):**
- Project 1 "FairTraze AI" — 5 members mapping to real GitHub usernames
- Project 2 "PersonalFinanceTracker" — 2 members
- Project 3 "uConnect" — 3 members (anonymized as Member A/B/C)
