# System Overview Page — Audit

**Route:** `/overview` (public, no auth required) — registered in [client/src/App.tsx:60](client/src/App.tsx#L60)
**Page shell:** [client/src/pages/OverviewPage.tsx](client/src/pages/OverviewPage.tsx) — top bar, page header ("System Overview" / "What's implemented, what's planned, and how the system works"), renders `<SystemOverview />`, footer disclaimer.
**Content component:** [client/src/components/SystemOverview.tsx](client/src/components/SystemOverview.tsx) (670 lines) — this is where all actual content lives.

Linked from the footer as "System Overview →" on: `LandingPage`, `AdminPage`, `StudentPage`, `StudentGroupPage`, `ProjectDetailPage`, `SettingsPage`, `DisputesPage`, `ClassPage`, `DemoPage`, `AlertsPage`, `AssignmentPage`, `StudentClassPage`. Also present as a nav item in `AppSidebar`.

**Bug noted in passing, later found already fixed:** this audit originally flagged `DisputesPage.tsx:398`, `ClassPage.tsx:775`, `DemoPage.tsx:793`, `AlertsPage.tsx:223`, `AssignmentPage.tsx:316` as calling `navigate("\overview")` (backslash) instead of `"/overview"`. Re-checked during the rewrite pass below — all five already use the correct forward slash. See "Bug check" under "Rewrite shipped."

## What currently exists on the page (10 sections + legend)

1. **WhatItIs** — one paragraph description + "core principle" callout (math scores / AI explains). Good, matches CLAUDE.md language closely.
2. **DataSources** — GitHub card marked `✓ Implemented`; FairTraze Collaborative Editor card marked **`Planned — next build`** (dashed border, amber). Includes the combined-scoring formula.
3. **SystemRoles** — three cards (Instructor / Student / Admin) with bullet capability lists. Reasonably complete already.
4. **Lifecycle** — 5-step "Project Lifecycle" walkthrough (instructor creates assignment → students enroll → leader creates group → members join → instructor locks & analyzes) plus a note that leadership carries no scoring credit.
5. **ScoringSection** — GitHub-only pipeline (5 steps), contribution formula, 4 flag cards, Gini/team-health bands. Detailed — arguably more technical depth than the user asked for on this page ("light-touch, not the full technical breakdown").
6. **GroupRoles** — Leader / Developer / Documentation role cards; Documentation marked `Planned — next build` (dashed amber) with note "activates once the Collaborative Editor is built (planned)."
7. **AISection** — What the AI does / strictly does not do, two-column.
8. **FairnessTools** — 4 cards: fairness report, export/print, at-risk alerts, dispute workflow — all marked Built.
9. **PrivacySection** — 3 cards: decision-support not auto-grading, scoped student visibility, dispute path.
10. **WhatsNext** — "Planned Build" banner describing the FairTraze Collaborative Editor and combined scoring as **future/not-yet-built** work.
11. **Legend** — implemented (emerald) vs. planned (amber) key at the bottom.

**Missing entirely:** a "Where to go next" section with role-aware navigation links (My Classes / Dashboard / Admin Panel). Nothing on the page currently reads the logged-in user or links anywhere.

## Key finding: the page describes a system that no longer matches the codebase

CLAUDE.md (checked into the repo) states the Collaborative Editor is "**DESIGNED / PLANNED — Phase D**" and lists it explicitly under "Out of scope — DO NOT build these." The current `SystemOverview.tsx` content agrees with that framing (Editor = "Planned — next build" everywhere).

**But the working tree (branch `feat/model-b`) has already substantially built it:**
- `client/src/components/DocumentEditor.tsx` — a real TipTap/Yjs editor component, actively rendered on [StudentGroupPage.tsx:888](client/src/pages/StudentGroupPage.tsx#L888) (`<DocumentEditor groupId={projectId} editable={true} />`).
- `server/src/collab/` — Yjs collaboration/authorship-capture backend.
- `server/src/routes/documents.ts` — document API routes.
- `shared/src/documentScoring.ts` + `shared/src/editClassifier.ts` (+ tests) — a full deterministic editor-scoring pipeline mirroring `scoring.ts` (retained-text share, session share, active-days share, self-churn discount, edit-type weighting, Gini/health/flags).
- `shared/src/combinedScoring.ts` — blends GitHub + Editor shares (`sourceType: "GITHUB" | "EDITOR" | "COMBINED"`), referenced across `server/src/routes/{analyze,projects,groups,assignments,join}.ts` and `server/src/lib/roles.ts`.
- Four new Prisma migrations (`add_document`, `add_document_yjs_state`, `add_edit_events_and_sessions`, `add_edit_type`) and the most recent commit on this branch is literally *"feat: FairTraze Docs step 5 - combined scoring across GitHub and documents."*

So the Editor + combined scoring is real, wired end-to-end, and demoable — not a future build. The user's task instructions for this page (describe both sources as available now, "a project can use either one or both combined") match the actual code, not CLAUDE.md's stale scope note or the current page's "Planned" badges.

**Implication for the rewrite:** the new page should present GitHub and the Collaborative Editor as two live, implemented data sources (dropping the amber "Planned" treatment for the editor), reflecting what's actually in this branch. This is a content decision, not a scoring/analyzer change, so it doesn't conflict with the "don't change scoring" rule in CLAUDE.md. CLAUDE.md itself appears to be out of date relative to this branch and may be worth a separate update pass later — not done here since it wasn't requested.

## Rewrite shipped

`SystemOverview.tsx` was restructured into exactly the 6 sections planned, all rendered by `SystemOverview()` in file order:

1. **`WhatItIs`** — purpose statement + "math scores, AI explains, instructor decides" principle (extended the original callout with "the instructor decides").
2. **`DataSources`** — GitHub + Collaborative Editor, both cards now use the indigo "✓ Live" treatment (no amber/dashed styling anywhere on the page); combined-scoring formula kept as-is.
3. **`ScoringSection`** — trimmed to a light-touch pass: one paragraph on contribution share plus significance weighting, the four flag cards, and the Gini/health bands. The old 5-step pipeline and formula-heavy detail were dropped; a closing line points instructors to Scoring Settings and the per-report breakdown for full depth.
4. **`SystemRoles`** ("The Three Roles") — Student / Instructor / Admin capability lists, lightly tightened from the original (dispute/audit-log/institution-analytics points preserved).
5. **`PrivacySection`** ("Fairness and Privacy Commitments") — six commitment cards: decision-support not auto-grading, scoped student visibility, leadership-carries-no-advantage (folded in from the old `Lifecycle` note), configurable/transparent weights, dispute path, and roles-never-change-scores (folded in from the old `GroupRoles` closing note).
6. **`WhereToGoNext`** — new, role-aware via `useAuth()` + `useRouter()`: STUDENT → "Go to My Classes" (`/student`), INSTRUCTOR → "Go to Dashboard" (`/dashboard`), ADMIN → "Go to Admin Panel" (`/admin`); logged-out → Sign In (`/login`) + Register (`/register`) prompt. Shows a loading state while `useAuth()` resolves the session.

**Sections retired, per plan:**
- `Lifecycle` — cut; its one durable point (leadership grants no scoring credit) now lives in `PrivacySection`.
- `ScoringSection`'s 5-step pipeline and per-flag technical prose — cut; condensed to the light-touch pass in section 3.
- `GroupRoles`' full Leader/Developer/Documentation card breakdown and assignment-authority list — cut; the one durable point (roles never change scores) now lives in `PrivacySection`.
- `AISection`'s do/don't two-column lists — cut; condensed into section 1's core-principle callout.
- `FairnessTools` (PDF export, at-risk alerts, dispute workflow feature cards) — cut as a feature list, not overview content.
- `WhatsNext` ("Planned Build" banner) — cut entirely; the editor is presented as live in section 2, not upcoming.
- The bottom **Legend** (emerald vs. amber key) — cut; with nothing left in "planned" state, a built-vs-planned legend had nothing to explain.

**Badge changes:** `Planned` (amber, dashed-border) component was removed from the file entirely — nothing on the page is in that state anymore. `Built` was renamed `Live` and now appears only on the two `DataSources` cards, since every other section is uniformly current and didn't need a per-section badge.

**Confirmed:** no amber/dashed-border styling remains anywhere in `SystemOverview.tsx`; `tsc --noEmit` passes clean after the rewrite.

**Bug check:** the `navigate("\overview")` backslash bug flagged above (`DisputesPage.tsx:398`, `ClassPage.tsx:775`, `DemoPage.tsx:793`, `AlertsPage.tsx:223`, `AssignmentPage.tsx:316`) was re-checked during this pass — all five already call `navigate("/overview")` with the correct forward slash. No code change was needed; the note above is stale and kept only as history.

Visual style stayed consistent with the original file: white cards, `rounded-xl border border-slate-200 shadow-sm`, indigo accent for primary content, slate for neutral, section headers via the existing `SectionHeader` helper.
