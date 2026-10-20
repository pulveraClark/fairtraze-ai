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
- **Instructor approval**: new instructor sign-ups are pending until an admin approves them (see "Instructor approval" below).
- Basic admin/audit tooling: user management (create/edit/promote/deactivate), role assignment, and a system-wide audit log (`admin.ts`, `AdminPage.tsx`, `AuditLogPage.tsx`, `AuditLog` model). This is account administration, not the cross-section analytics dashboards described under Phase F below, which remain unbuilt.

## FAIR TRAZE Collaborative Editor (Second Data Source)

**Status: IMPLEMENTED.** Live for `EDITOR` and `COMBINED` assignments.

The Collaborative Editor is a writing environment built directly into FAIR TRAZE AI (not Google Docs or any external tool). It records per-user, timestamped document collaboration traces and is the system's second data source — complementing GitHub to cover documentation and writing contributions alongside technical code work.

### What it records (implemented)
- Character-level insert/delete events (`EditEvent`: position, length, timestamp), attributed to the logged-in account
- Edit sessions — contiguous editing bursts per user, closed after 30 minutes idle (`EditSession`)
- Rule-based significance classification of each insert (`EditType`: substantive / revision / formatting / trivial)
- Comments — see "Comments — IMPLEMENTED" under "Editor Scoring Model" below
- Tables, text alignment, and font/highlight color (`@tiptap/extension-table*`, `@tiptap/extension-text-align`, `@tiptap/extension-color`, `@tiptap/extension-highlight`, registered in `DocumentEditor.tsx`) — purely additive editor surface. Text typed anywhere, including inside a table cell, flows through the exact same `authorshipCapture.ts` diff/classify/session pipeline as any other text: `extractPlainText` recurses on Yjs node *class* (`Y.XmlText` vs. everything else), never on node *name*, so a table cell is structurally identical to a heading or list item from the diffing code's point of view — no new `EditSource`, no pipeline changes. Comment anchoring (`commentAnchor.ts`) is also unaffected — its `RelativePosition` mechanism walks the Yjs type tree regardless of nesting depth.
- Authorship highlighting (color-coded by author) is on by default in both the student (editable) and instructor (read-only) views, with a toolbar toggle to turn it off.

### Page view and PDF export — IMPLEMENTED
The document is shown as real bond-paper sheets (Letter 8.5×11in default, Legal 8.5×14in, A4; margins 0–3in, default 1in) on a gray desk, with the toolbar pinned above (never part of the page). Sheets, margins and the gap between them are ProseMirror **decoration widgets only** (`tiptap-pagination-plus`, MIT, pinned exact; wrapped in `client/src/lib/pageLayout.ts`) — never document content — so layout adds **0 characters** to anyone's authorship count (`client/src/lib/pageLayout.test.ts`, `server/test/authorshipCapturePagination.test.ts`). No header, footer or page numbers are ever added. Paper definitions live in `shared/src/pageSizes.ts` (layout only; never read by scoring).
- **Page setup is per document and shared by all collaborators**: `Document.pageSize` (`LETTER | LEGAL | A4`; labelled "Letter (8.5 × 11 in)", "Legal (8.5 × 14 in)", "A4 (210 × 297 mm)" to match Chrome), plus `orientation` (`PORTRAIT | LANDSCAPE`), `marginPreset` (`NORMAL` 1in | `NARROW` 0.5in | `WIDE` 1in top/bottom + 2in sides | `CUSTOM`) and the four effective margins in inches (`marginTop/Bottom/Left/Right`, 0–3 in in steps of 0.1; presets write their own numbers, `CUSTOM` stores the user's), and six plain-text header/footer slots (`headerLeft/Center/Right`, `footerLeft/Center/Right`, max 120 chars each, `{page}` = page number). Migrations: `20261015100000_document_page_size`, `20261016100000_document_page_setup`, and **`20261017100000_page_size_rename_custom_margins`** (SHORT→LETTER, LONG→LEGAL (the old Long was 13in, Legal is 14in), margin backfill from the preset, default `LETTER`; not a Yjs change, so `COLLAB_SCHEMA_VERSION` stays 2). **At least 2in of writing space must remain in width and height** (after orientation and a header/footer line of 0.3in each): one rule, `validateMargins` in `shared/src/pageSizes.ts`, used by the Page setup dialog (inline text error, Apply disabled) and re-checked by the route on the *resulting* setup (400 with the same message, also for orientation/paper/header changes). Changed from **Format → Page setup** and **Insert → Headers and footers** by group members (`PATCH /api/groups/:id/document/page-setup`, any subset of fields; `GET` returns the whole setup incl. `margins`; the older `page-size` routes remain as aliases), read-only for the instructor, polled every 15s/on focus by other tabs. Plain column writes — not in the Yjs doc, no `EditEvent`/`EditSession`/`Alert`, no `membershipChangedAt`/`scoringConfigChangedAt` bump (so it never marks an analysis outdated), and it never creates the `Document` row (the template picker is not skipped). One geometry helper, `resolvePageGeometry` in `shared/src/pageSizes.ts` (layout only), feeds the page view, the PDF and the `.docx`. Header/footer text is HTML-escaped at render time (`client/src/lib/headerFooter.ts`); the plugin has no centre slot, so centre text is CSS-positioned inside the left slot. **TEMPORARY (remove later):** `normalizePageSizeKey` in `shared/src/pageSizes.ts` and `parsePageSetup` (`client/src/lib/pageSetup.ts`) still map the old keys `SHORT`/`LONG` for the deploy window where an old tab or response can carry them; delete the mapping (and its tests) once no client older than migration `20261017100000` can be open.
- **Download PDF** (File → Download PDF; `client/src/lib/pdf/`): a real **vector PDF built in the browser**, one click, no print window, that follows every Page setup setting (paper, orientation, all four margins, headers/footers with `{page}`, page breaks). `printDocument.ts#layoutPrintCopy` lays a **separate read-only TipTap copy** out offscreen in a hidden iframe (same extensions/CSS/fonts as the page view, with the page view's own 24px sheet gap, so its layout is the same by construction (a gap-less layout drifted 2px per page at 0 margins); no Collaboration/Yjs, no authorship/comment/cursor plugins; the iframe is forced to the light color scheme and the app's `prefers-color-scheme: dark` rules are switched off, so the PDF is always the document's own black on white even in a dark app theme). `collectLayout.ts` reads the browser's own positions (`Range.getClientRects` per word; every line fragment of a long URL; `getComputedStyle` for font, size, color, decorations, backgrounds, borders) into plain draw ops in **document order** (so copy/paste reads right: a list number precedes its item, headers/footers sit where they are), in 16 ms slices with Cancel. `pdfWorker.ts` (a module **Web Worker**, loaded only when the user clicks; `pdf-lib` 1.17.1 + `@pdf-lib/fontkit` 1.1.1, MIT, pinned exact) writes the PDF: text is real selectable text, positioned per word with per-word character spacing to the measured width; underline/strike, super/subscript, highlight, text color, tables (borders, header shading), lists (bullet/number markers drawn to Chrome's geometry), checklists, horizontal lines, images (PNG/JPEG as is, WebP/GIF re-encoded to PNG), links (clickable URI annotations, `isSafeLinkUrl` http/https/mailto only). File name `<document title>.pdf` (the group name; `pdfFileName.ts`), PDF title metadata set. Progress panel + Cancel (`PdfProgressPanel.tsx`), then a "PDF downloaded" message; on failure a clear message with a one-click "Use Print instead". **Read-only**: no Yjs update, no EditEvent, no network request except the app's own font/image files (`e2e/pdfExport.mjs` asserts it). Characters no bundled font has (emoji, CJK…) are left out and listed in the success message. Never touches `server/src/collab/`. Waiting for images ignores ProseMirror's own `img.ProseMirror-separator` (an image-only paragraph used to hang the export forever) and gives up on a broken image after 8s; WebP/GIF are re-encoded to PNG before layout.
- **Checklist items are plain blocks** (checkbox absolutely positioned, `padding-left: 1.5rem`), not flex rows: a flex item is a block formatting context, which next to the page extension's float spacers shrank to a sliver at a page boundary (text stacked one letter per line, in the page view and the PDF).
- **Print** (File → Print): builds the same PDF and opens it in a **new tab** (the browser's PDF viewer scales to the paper and margins chosen there; the tab is opened inside the click so pop-up blockers allow it). If pop-ups are blocked or the PDF cannot be built it falls back to the old browser print window (`printDocument.ts#printDocument`): the layout is frozen into one fixed-size clipping box per sheet (the extension's float spacers are mangled by Chrome's own print fragmentation otherwise; each sheet is `overflow: hidden; contain: paint; clip-path` and the last is 1px short so rounding never adds a blank page), `@page { size: <paper>; margin: 0 }`. That fallback still depends on the user's print dialog settings (margins None, headers/footers off); it is a fallback only.
- **Writing-area fonts** (`client/src/assets/fonts/`, licenses in `LICENSES.md`, all SIL OFL 1.1): the page view and the PDF use the **same WOFF files** (a face = latin + latin-ext parts; WOFF, not WOFF2, because pdf-lib's subsetter crashes on Geist WOFF2). Menu item → file: Default → Geist; Sans Serif → Arimo (Arial metrics; same design as Liberation Sans, which Fontsource does not ship); Serif → Gelasio (Georgia metrics); Monospace → Cousine (Courier New metrics); Comic Sans → Comic Neue (**not** metric-compatible, so a document using it may reflow slightly). Stored font marks keep their CSS stacks (`Arial, Helvetica, sans-serif`…); `index.css` maps them to the private `FT …` families **inside `.ft-doc-content` only** (the app UI is untouched), every stack falls back to Geist for glyphs its own font lacks (the PDF uses the same chain). Parts load lazily by `unicode-range` with `font-display: swap`; pagination and the PDF measure after `document.fonts.ready`. `client/src/lib/pdf/fonts.test.ts` checks every file parses, subsets, and covers Filipino text (ñ Ñ, accented vowels, ₱).
- **`.docx` export** (`server/src/collab/documentExport.ts`, the one file in `collab/` allowed to change for formatting) now writes paper size, orientation, margins, headers/footers (centre/right via tab stops, PAGE field for `{page}`), page breaks (`pageBreakBefore` on the next paragraph), strike, justify, indent, checklists, horizontal lines, nested list levels and links (only http/https/mailto survive).
- Caveats: **tables taller than one page do not split across pages** (we use `@tiptap/extension-table*`, not the extension's `TablePlus*`; accepted limitation). A trailing blank sheet (the extension adds one when the last block ends right at the bottom) is a sheet in the page view and so a page in the PDF: what you see is what you get.
- **Accepted limitation — header/footer text uses body space.** `tiptap-pagination-plus` places header and footer text at the top/bottom of the *content area*, so each sheet loses about one line of body space when a header or footer is set. Word puts that text inside the margin. The page view and the PDF match each other exactly, but a `.docx` opened in Word can paginate slightly differently (Word has the extra line back). Matching Word would need dynamic margin arithmetic; deliberately not done.
- **Page break** (`client/src/lib/pageBreak.ts`): the extension has no forced break, so a leaf `pageBreak` block (no text, +0 characters) gets a height computed from the sheet bands so the next block starts on the next sheet; the same node and function run in the PDF print copy. Insert → Page break / Ctrl+Enter. Two breaks in a row leave a blank sheet (as in Word).
- **Local-only browser checks** (not part of `npm test`, not in CI): `npm run test:e2e -w client` starts a throwaway Vite server and headless Chromium and runs three checks. `pageParity.mjs` renders 24 layouts as the page view, the print copy and a real Chromium PDF and asserts identical page count and first line per sheet. **`pdfExport.mjs`** builds the real PDF for Letter/Legal/A4 × portrait/landscape × presets and custom margins (e.g. 1/1/0.5/1), headers/footers with `{page}`, page breaks, an every-feature document, wrapped long URLs, list markers at 12/14/16/20/24px, missing glyphs, a dark app theme, and reads it back with `pdfjs-dist`: PDF pages == sheets, MediaBox == page setup, first body word per page, extracted text == document text in order, nothing on two pages, all ink inside the margins, link annotations safe, **per page ≤ 0.5% of pixels differing after 1px tolerance** against a screenshot of the same sheet, **every word's ink box and every list marker within 1px (0.75pt)** of the screen's, export read-only (0 Yjs updates), no network beyond app assets, and a 50-page run (timings, heap, main-thread stall) with progress and Cancel. `schemaMismatch.mjs` measures the old-client schema risk (below). Needs the Playwright Chromium already installed for this repo; uses no backend or database.
- `PaginationPlusSafe` (`pageLayout.ts`) guards a real crash: with collaboration, sync transactions can land before TipTap v3 mounts the view and the extension's `apply` reads `editor.view.dom`.

### Editor tools — IMPLEMENTED
Strikethrough, justify, links, clear formatting, checklists (`@tiptap/extension-list` TaskList/TaskItem), horizontal line, indent/outdent, page break, find and replace, page setup, headers/footers. Marks, node attributes and leaf nodes carry no text, so **every one of them adds 0 characters** (`server/test/authorshipCaptureEditorTools.test.ts`, `authorshipCapturePageSetup.test.ts`, `client/src/lib/pageLayout.test.ts`); formatting/layout never touches `server/src/collab/` (only `documentExport.ts` changed).
- **Links**: only `http`, `https`, `mailto` (`shared/src/linkUrl.ts`, bare domains become `https://`); enforced in the dialog, at render time (a hostile href written into the shared Yjs doc by a modified client is never rendered clickable), in the PDF copy and in the `.docx`. Open in a new tab with `rel="noopener noreferrer"`.
- **Indent** is a node attribute (`client/src/lib/indent.ts`, 0.5in steps); Tab/Shift+Tab indent but **never trap focus** (Esc then Tab leaves, WCAG 2.1.2); Tab inside a table still moves between cells.
- **Find and replace** (`client/src/lib/searchReplace.ts`): replaced text is credited to the person who replaced it (a normal edit). Matches whose replacement is identical are skipped, and **Replace all applies one transaction per match** — capture trims one common prefix/suffix per update (see the limitation below), so a single big transaction would re-credit all unchanged text between the first and last match. Replacing words inside someone else's text deletes their retained characters and credits the replacement to the replacer.
- Shortcuts: Ctrl+Shift+X strike, Ctrl+K link, Ctrl+F find, Ctrl+H replace, Tab/Shift+Tab indent, Ctrl+Enter page break; every button has a tooltip with its shortcut. Edit menu (find/replace), Insert menu (page break, horizontal line, headers and footers), Format → Page setup. The instructor's read-only view keeps find but no replace or editing tools.
- **Toolbar overflow** is computed from measured group widths (`overflowFor` in `DocumentEditorToolbar.tsx`); groups collapse into "More" only when they do not fit (word count, collaborator chips, Review, Insert, Paragraph, Formatting, Edit, View, History). Verified in a real browser: no clipping and no horizontal scroll from 375px to 1600px.
- Dialogs (link, page setup, headers/footers) share `client/src/lib/useFocusTrap.ts`: Tab stays inside, Esc closes and returns focus to the editor.

### Document schema version gate — IMPLEMENTED
`y-prosemirror` **deletes any element its schema does not know and syncs the deletion to everyone** (measured in `client/e2e/schemaMismatch.mjs`): a tab opened before `pageBreak` shipped would erase every page break in the shared document. So `COLLAB_SCHEMA_VERSION` (`shared/src/collabVersion.ts`, currently 2: 1 = original schema, 2 = adds `pageBreak`) is bumped **only when a change to the Yjs document schema would break older clients** — not on every deploy. The collab client sends `?v=`; `server/src/collab/yjsServer.ts` closes a client with a different or missing version with code 4409 before it joins the room (connection gating only — sync, persistence and authorship capture are untouched). The client (`useCollabVersionGuard`) also polls the public `GET /api/version` (registered before the global rate limiter) on mount/focus/every minute; on a mismatch it disconnects (no Yjs updates are sent), goes read-only and shows "A new version is available - reload to keep editing." Old tabs that predate the check cannot show the banner (they simply cannot reconnect). **Bump the constant whenever a new Yjs node/mark type is added.**

### Not implemented (documented as a limitation, not a bug)
- Tracked-change suggestions (accepted/rejected) — no `Suggestion` model exists; only insert/delete shape is captured. Deliberately deferred — see "Tracked-change suggestions — NOT implemented (deliberately deferred)" below for why.
- Per-edit (continuous) revision history — point-in-time snapshots exist only once per analysis run (see "Document history" below); there is no snapshot per edit, and current ownership is still reconstructed by replaying the `EditEvent` log

### Document history — IMPLEMENTED (one snapshot per analysis run)
`DocumentSnapshot` (`documentId`, `reportId`, `yjsState`, `createdAt`) is written by `writeDocumentSnapshot` in `server/src/routes/analyze.ts` right after each `EDITOR`/`COMBINED` analysis creates its `Report`: a plain Prisma copy of the already-persisted `Document.yjsState` (skipped when the document has no saved state). It never calls `getYDoc()`, never touches the live room and has no interaction with `authorshipCapture.ts`. Read-only browsing: `GET /api/groups/:id/document/snapshots` and `.../snapshots/:snapshotId` (`routes/documents.ts`; group members and the class's instructor; `EDITOR`/`COMBINED` assignments only; a snapshot is rebuilt into read-only blocks with `readDocumentStructure`), shown as **History** by `DocumentHistoryPanel` on the student group page and the instructor `ProjectDetailPage`. "No history yet" until the first analysis. Never read by scoring.

### Why it matters — the system's main differentiator
GitHub captures code. The Collaborative Editor captures writing and documentation. Together they give instructors a view of both technical and documentary contributions — especially important for teams where some members are primarily documentation or research contributors who appear invisible in GitHub data alone. This dual-source integration distinguishes FAIR TRAZE AI from tools that analyse only code repositories.

### Combined scoring (implemented — `shared/src/combinedScoring.ts`)
Each source produces its own per-member contribution share, normalised independently within that source. The two shares are then blended:

```
combinedShare = wGitHub × githubShare + wDocs × editorShare
```

Default blend: 50/50 (`weightGithub = 0.5`, `weightDocs = 0.5` on `Assignment`). Instructor-configurable **per project** (the `Assignment` model — "project" in the UI; a "group" is the `Project` model) via Scoring Settings; applies to GitHub and Combined projects and to every group in the project. The blending is deterministic; the AI only writes the plain-language narrative. The math-scores-AI-explains principle is fully preserved. `flags` (including `deadline-driven`) are computed from a **unified timeline** merging both sources' timestamps, not from either source alone — see `combinedScoring.test.ts`.

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
- **Net retained text** *(primary meaningful-contribution signal)* — text the member contributed that survived, weighted by edit-type significance (`weightedRetainedChars`), not gross typing volume. This is the editor analog of `effectiveAdditions` (weighted lines added) in GitHub scoring.
- Characters inserted / deleted per user (`totalInsertedChars`, `totalDeletedChars`)

### Activity & volume
- Churn (characters added + deleted)
- Self-churn — writing then deleting one's own text before it survives (`selfDeletedChars` / `totalInsertedChars`); penalised the same 50%-cap formula as GitHub's self-churn ratio
- Editing sessions (`EditSession`, closed after 30 minutes idle) — the editor analog of commits, passed through the same log-scale diminishing-returns treatment

### Temporal
- Active editing days — Asia/Manila calendar days on which the member wrote at least `MIN_ACTIVE_DAY_RETAINED_CHARS` (30) characters that are still in the final document (`retainedCharsByDay`, bucketed from the `EditEvent` replay in `editReplay.ts`/`editStats.ts`; imports count on the upload day). Falls back to distinct session-start days only when per-day retention is not supplied (old test fixtures).
- Edit-timing distribution — used for the `deadline-driven` flag, but currently computed the same way as GitHub's (data-derived 2/3 split of the observed activity span). **Not yet implemented:** anchoring this window to `Assignment.deadline` (see "Analysis & Fairness Logic" below) — there is no `startDate` field on `Assignment` yet.

### Structural / content-type weighting (`shared/src/editClassifier.ts` — IMPLEMENTED)
Each INSERT event is classified by substance, analogous to commit-impact classification:
- **Substantive** (new content) → high weight
- **Revision** (rewriting existing content) → moderate weight
- **Formatting** (shape-detectable spacing/reordering/same-length replace) → low weight
- **Trivial** (punctuation, single-character corrections) → minimal weight

DELETE events and pre-migration rows have no `editType` (treated as neutral 1.0 weight).

### Comments — IMPLEMENTED
A group member can attach a comment (with flat, one-level-deep replies) to a range of text in the document, and resolve/reopen the thread. **Fully orthogonal to the collab write path**, by design: `Comment` (`server/prisma/schema.prisma`) is a plain Prisma model reached only through plain REST routes (`server/src/routes/comments.ts` — `GET`/`POST /api/groups/:id/document/comments`, `PATCH .../comments/:commentId/resolve`, `DELETE .../comments/:commentId`), following the exact same "context-only metadata" shape as `Task`/`Dispute`/`RoleSuggestion`. A comment's text lives in Postgres, never in the shared `Y.XmlFragment` — zero changes to `authorshipCapture.ts`, zero new `EditSource` value, zero interaction with `getYDoc()`/`ydoc.transact()`. **Never affects scoring**, structurally, not just by convention: there is no code path from a `Comment` row into `shared/src/documentScoring.ts`.

The hard problem — keeping a comment anchored to "this sentence" as other members concurrently edit the document — is solved with Yjs's own `RelativePosition` API (via `@tiptap/y-tiptap`'s public `absolutePositionToRelativePosition`/`relativePositionToAbsolutePosition`, the same mechanism `@tiptap/extension-collaboration` itself uses internally — see `client/src/lib/commentAnchor.ts`), not a raw offset pair, which would silently drift. The rendering side reuses `authorshipHighlight.ts`'s exact proven ProseMirror-decoration pattern (`client/src/lib/commentHighlight.ts`) — a non-intrusive highlight, never real document content.

**Known limitation**: if the exact text a comment was anchored to is later deleted entirely, Yjs's `RelativePosition` does not reliably signal this with a clean failure — confirmed by `client/src/lib/commentAnchor.test.ts` — it commonly resolves to a zero-width position near where the deleted content used to be, rather than an outright null. `decodeCommentAnchor` normalizes both cases to `null`; the comment stays visible in the side panel (nothing is silently lost) but its inline highlight disappears.

### Image insertion — IMPLEMENTED
A member can insert PNG/JPEG/WebP images into the document via the toolbar's "Insert image" button (`DocumentEditorToolbar.tsx` → `DocumentEditor.tsx`'s `handleImageFileChange`). Base64-inline, no object storage, no new REST route: the file is content-sniffed (magic bytes, not extension/MIME), size-capped at 2MB client-side, read via `FileReader`, and inserted straight into the live collaborative document with `editor.chain().focus().setImage({ src: base64DataUrl }).run()` — the same write path any other live typed content uses (`@tiptap/extension-image`, registered collab-branch-only in `DocumentEditor.tsx`, same pattern as `Table`).

**Disclosed, never scored.** TipTap image nodes are attribute-only `Y.XmlElement`s with no `Y.XmlText` child, so they produce zero text delta in `authorshipCapture.ts`'s diff pipeline — invisible to `EditEvent`/`retainedChars` by construction, same as any other node-only change (see "Mark/node-type-only edits are invisible" below). A sibling walk, `countImageNodes` (mirrors `extractPlainText`'s traversal but counts `Y.XmlElement`s named `"image"` instead of accumulating text), runs in the same `ydoc.on("update", ...)` listener and attributes net-new image insertions to the same `userId` the text diff already resolves — no new origin marker needed, since images only ever arrive live. The count is stored on a new `EditSession.imageInsertCount` column (gross, not net of deletions — same convention as `characterCount`), summed in `editStats.ts`, and threaded through `DocumentScoredMember.insertedImageCount` exactly like `.docx` import's `importedRetainedChars` — spread straight onto the output, never entering `effectiveRetainedChars`/`logSessions`/any share or `contributionShare` term. Shown on the report as a disclosure line (`MemberTable.tsx`, cyan styling, same visual pattern as the amber Import note) and an expanded-row `Stat`.

**Known limitation — size cap is client-only.** Unlike `.docx` import, image insertion never hits a REST route, so there is no server-side re-check of the 2MB cap the way `documents.ts` re-validates the import's decoded `Buffer.length`. `y-websocket` applies and broadcasts a sync update before `authorshipCapture.ts`'s listener ever runs, so true rejection isn't achievable without intercepting the sync protocol — out of scope. A modified/malicious client could still push an oversized base64 image straight into the Yjs doc. Accepted as a documented limitation, same as the other gaps in this section.

### Image resize and reposition — IMPLEMENTED
A member can resize an inserted image via a corner drag handle (aspect ratio locked by default) and reposition it to a different point in the document's flowing structure via a drag handle — both official `@tiptap/extension-image`/`@tiptap/extension-drag-handle-react` capabilities (`Image.configure({ resize: {...} })`, `DragHandle` component scoped to image nodes, `DocumentEditor.tsx`), no hand-built NodeView, no canvas-style absolute positioning.

**Resize — invisible to scoring, same mechanism as insertion.** `width`/`height` are ordinary attributes on the existing `image` node (already present in `@tiptap/extension-image`'s schema, unconditionally — not added by this feature); a resize commits via `editor.commands.updateAttributes("image", { width, height })`, a plain attribute-set transaction with zero text delta. `authorshipCapture.ts`'s `extractPlainText`/`countImageNodes` gate (`if (!diff && insertedImages === 0) return;`) short-circuits before any `EditEvent` row is constructed — same dead-code-path the "Disclosed, never scored" paragraph above already documents for insertion.

**Reposition — a real content-position change, safe only because it's one atomic transaction.** Unlike resize, dragging an image to a new point in the flow is a genuine ProseMirror delete-at-source + insert-at-target operation (ProseMirror has no distinct "move" step) — functionally identical to a manual cut-and-paste of the image, which this editor has always permitted. `@tiptap/y-tiptap` translates the drag's single ProseMirror transaction into one atomic `ydoc.transact()` call, so `authorshipCapture.ts` sees it as one Yjs update: `extractPlainText`'s diff is still empty (the image contributes no characters at either position) and `countImageNodes`'s fresh whole-tree recount nets to zero delta (node existed once before, once after) — same zero-`EditEvent` outcome as resize, verified in `server/test/authorshipCaptureImage.test.ts`.

**Known limitation — gross-count double-attribution if a move ever spans two Yjs transactions.** `countImageNodes`'s accounting is a fresh whole-tree count each update, not identity-tracked, and only ever adds *positive* deltas to `EditSession.imageInsertCount` (deletions are never subtracted — the same "gross, not net" convention as `characterCount`). This is safe as analyzed above only because a single drag commits as one atomic transaction. A manual cut then a separate paste — already possible today, unrelated to this feature — fires two separate Yjs updates: the cut's delete-side nets to a transient `imageDelta = -1`, silently dropped, and the paste's insert-side nets to `imageDelta = +1`, which **is** counted as a genuine new insertion and attributed to whoever's connection commits that second transaction, even though no image was actually added. This is a pre-existing edge case of the disclosure-only image-count design (not introduced by resize/reposition), accepted as documented — same standard as every other gap in this section — rather than a design change, since `insertedImageCount` never affects `contributionShare`/`gini`/`teamHealth`/any flag regardless.

### Tracked-change suggestions — NOT implemented (deliberately deferred)
Unlike Comments, a "suggestion" is provisional content that becomes real document content on accept — indistinguishable, once accepted, from a normal typed edit to `authorshipCapture.ts`'s diffing. That means accept/reject cannot avoid interacting with the same collab write path this project has needed four real rounds of hardening on (the writeState/bindState restore race, the authorshipCapture registration-lag race, the room-eviction limitation, the template-picker typing race) — either a new origin/`EditSource` variant would need to thread through `authorshipCapture.ts`'s origin-dispatch logic, or the existing origin-based attribution would silently (and very likely wrongly) credit whoever's WebSocket connection performs the accept transaction, not who wrote the suggested words. Separately, "who gets credit for an accepted suggestion — the suggester, the accepter, or a split" has no safe default and needs an explicit instructor-facing policy decision made outside of an implementation PR, the same way role-based score re-weighting is already treated as "optional and not the default... requires explicit instructor configuration" (see "Roles never change scores" above). Revisit only once both an explicit scoring policy exists and there's a specific reason to believe the collab pipeline has stopped surfacing new timing bugs — neither is true today. Edits-to-others'-text review credit is out of scope for the same reason: it's a variant of the same suggestion-acceptance problem, not a separate one.

### Default weights (`DOCUMENT_DEFAULT_WEIGHTS`)
`retainedText: 0.6, sessions: 0.2, activeDays: 0.2` (rules version 2; was 0.4/0.2/0.4). Retained text is the primary signal; this is not a 1:1 mirror of the GitHub weights (0.4/0.4/0.2).

### GitHub → Editor signal mapping

| GitHub signal | Editor equivalent |
|---|---|
| Commits | Editing sessions |
| Lines added / deleted (churn) | Words added / deleted |
| Lines added (file type × commit impact, self-churn discounted) | Net retained text |
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
  - **Known limitation — tables in an imported `.docx` are dropped, not flattened.** Mammoth converts Word tables to real `<table>/<tr>/<td>` HTML, but `parseDocxToChunks` (`server/src/collab/docxImport.ts`) only dispatches on heading tags, `<p>`, and `<ul>/<ol>`; a `<table>` element matches none of these and falls through unhandled — its content is silently skipped entirely, not merged into surrounding paragraph text. This predates the live editor's own Table extension and became more visible once the editor could represent tables directly: a member can now build a table live but cannot import one from a source `.docx`. Not fixed as part of adding live table support — revisit only if `.docx` table import becomes a real user need.
- **Document templates — IMPLEMENTED.** A group's leader (or the instructor) can start a group's document from a pre-built structure instead of blank: Case Study, Business Plan, Lab Report, or Research Paper Outline (`shared/src/documentTemplates.ts`), or "Start blank." The picker (`client/src/components/DocumentGate.tsx`) is shown in place of the editor only when no `Document` row exists yet for the group (`GET /api/groups/:id/document/status`, which — unlike `GET /api/groups/:id/document` — does not auto-create); choosing seeds the row via `POST /api/groups/:id/document/init` (leader/instructor-only, `EDITOR`/`COMBINED` assignments only). This is create-time only — there is no "insert template" action once a document exists, and templates are never offered in the instructor's read-only view. Deliberately reuses the existing no-origin legacy-content migration already in `persistence.ts`'s `bindState()` (the same mechanism that already makes today's default empty document invisible to scoring) instead of adding new surface to the live Yjs write path: the route only sets `Document.content` at row-creation time, before any collaboration room is ever bound, so template boilerplate can never produce an `EditEvent`/`EditSession` row or count toward any member's score — stronger than `.docx` import's tracked-but-adjusted `IMPORT` model. Zero changes to `authorshipCapture.ts`, `docxImport.ts`, `editStats.ts`, or `documentScoring.ts`; no new `EditSource` value; no schema migration.
- **Typist credit** — one member may type up content authored collaboratively offline or dictated by another. The system credits the typist by default; the instructor must account for offline collaboration manually.
- **Formatting inflation** — applying a heading style to a large section registers as many edits but represents little intellectual contribution. Edit-type weighting (substantive vs formatting) mitigates but does not eliminate this.
- **Authorship capture offset bug — FIXED (one approved exception to "don't touch the collab pipeline").** `extractPlainText` in `authorshipCapture.ts` used `Y.XmlText.toString()`, which wraps marked runs in XML tags (`Hello <bold>world</bold>`). Recorded `EditEvent` positions/lengths therefore lived in a tag-inflated space the client's text-node walk (`authorshipHighlight.ts` `plainTextRangeToPMRange`) never sees — authorship highlight colors landed on the wrong words, and Docs retained/inserted counts were inflated; a bare mark toggle also produced phantom INSERT/DELETE events. It now joins each `Y.XmlText`'s `toDelta()` string inserts only (attributes and embeds ignored, no block separators, images/hardBreaks contribute no text) — the client's exact offset model, which was correct and is unchanged. Nothing else in the pipeline changed (diffing, event writing, origin attribution, flushing). Covered by `server/test/authorshipCaptureMarks.test.ts`. **Fix forward only, no history rewrite:** events recorded before `AUTHORSHIP_FIX_AT` (env var, ISO timestamp; default `2026-10-08T00:00:00Z`, `server/src/lib/authorshipFix.ts`) may be approximate. Report endpoints (`GET /api/projects/:id/report`, `GET /api/student/group/:projectId`) and `GET /api/groups/:id/document/authorship` add `docsDataApproximate` / `docsDataFixedAt` at read time (never stored), and the client shows `DocsDataApproximateNotice` on the report page, student report tab and editor authorship legend.
- **Capture records one changed region per Yjs update.** `authorshipCapture.ts` diffs the plain text with a single common-prefix/suffix trim, so one update touching two distant spots (a single-transaction replace-all, or an offline client's backlog sent as one merged update on reconnect) is recorded as one wide span: the unchanged text in between is credited to the editor and removed from the original author's share. It never mis-attributes *who* edited (attribution comes from the connection). Mitigated for find-and-replace (one transaction per match); the general fix (multi-region diff) is planned as its own change. Related: concurrent real-time typing can leave recorded positions off by one, so highlighted ranges may shift slightly.
- **Mark/node-type-only edits are invisible, not just unweighted** — now true and covered by tests (before the fix above it was not: `toString()` tag serialization made mark toggles emit phantom tag-text events). The capture pipeline (`server/src/collab/authorshipCapture.ts`) diffs plain text only (`toDelta()` string inserts). Toggling bold/italic on already-typed text, or converting a paragraph to a heading, changes no character content, so it produces **zero** `EditEvent` rows — not an unclassified one. Step 4b's edit-type classification (`shared/src/editClassifier.ts`) therefore only ever sees insert/delete shape (length, replace ratio) and cannot detect these mark-only operations at all. The FORMATTING bucket still fires for the shape-detectable subset — same-length replace, reordering, spacing touch-ups — just not for a bare bold/heading toggle with no text change. Capturing mark/node-type transactions would require extending Step 3's capture logic, not just the weighting layer.
- **Concurrent real-time attribution** — in real-time collaborative editing (multiple cursors simultaneously), character-level attribution is harder to resolve unambiguously than discrete Git commits. The Yjs CRDT tracks per-user edits, but concurrent simultaneous edits to the same region require a resolution policy.
- **Image move split across two transactions could misattribute a phantom insert** — see "Image resize and reposition — IMPLEMENTED" above; a manual cut-then-separate-paste of an image (not the drag feature itself, which is atomic) can transiently double-count in `EditSession.imageInsertCount` due to the gross-count, non-identity-tracked design already used for image-insert disclosure.
- **Reconnect-before-restore race — FIXED (approved exception to "don't touch the collab pipeline"; `persistence.ts`, `yjsServer.ts`).** Found on staging group 86: a single LIVE INSERT of 1212 chars (≈ the whole document) credited to the Demo Instructor ~10 min after a deploy restart. Cause: `getYDoc()` does not await `bindState`, and `setupWSConnection` sent sync-step-1 with the still-empty state vector, so a client holding the whole document (a tab left open across a restart; read-only mode is irrelevant) answered with all of it; `authorshipCapture.ts` diffed that against `lastText = ""` and attributed it to the connection. The saved Yjs state was never wrong (Yjs merges by item id, the text is not duplicated); only the `EditEvent`/`EditSession` log carried the phantom. For a group *member* the same event inflates that member's retained characters and Docs share, and in the replay it shifts every other span (slots > document length). Fix: `joinRoomWhenReady` (`yjsServer.ts`) accepts the socket, buffers its early messages (the client's own sync-step-1 must not be lost), awaits `roomReady(room)` (`persistence.ts`) and only then calls `setupWSConnection` and replays the buffer. A room whose restore fails, or is not ready after 10 s (`COLLAB_ROOM_READY_TIMEOUT_MS` overrides, tests only), is never served empty: the connection is closed with code 4503 (the client reconnects), a failed room is dropped, and `writeState` never persists a failed room. A reconnecting client's genuinely new edits are still recorded as that user's (only the real delta). Tests: `server/test/collabReadyBeforeSync.test.ts`. Repair of already-recorded phantoms: `server/scripts/auditPhantomInserts.ts` (dry run by default; `--apply` only with explicit `--event-ids`, prints before/after sums; see the file header); run the group's analysis again afterwards. Not covered here: `importDocxIntoRoom` still calls `getYDoc()` without awaiting the restore (member-only route, `ImportOrigin`, never a reconnect).
- **Read-only is enforced on the server — IMPLEMENTED (`collabAuth.ts` `canWrite`, `readOnlyGate.ts`, `connectionRegistry.ts` `readOnlyWs`).** The instructor view was read-only only in the browser (`editable={false}`), but `@tiptap/y-tiptap`'s sync plugin writes the browser's document back into Yjs on every view update and does not look at `editable`, and the server credited any update from any authorized socket to that user. Now only group members can write: for any other authorized connection (the owning instructor, an admin who owns the class) sync step-2 and update messages are dropped before y-websocket sees them (reading, the client's sync-step-1 and cursor awareness still work), and `authorshipCapture.ts` additionally refuses to attribute an update whose origin is a read-only connection (it still resyncs `lastText`). Instructors/admins therefore never own text and cannot appear in the authorship legend through live editing. Scoring was already roster-only (`editStats.ts`) and is unchanged. Tests: `server/test/collabReadOnlyGate.test.ts`. A deploy-restart SIGTERM flush of the 1.5 s event buffer and the 3 s debounced persist is a separate, not yet implemented task.
- **Room bind/eviction race — CONFIRMED and FIXED.** This was previously logged as "unconfirmed, not reproduced under normal usage." That assessment was wrong: it caused real, permanent content loss on a live project under completely ordinary usage (an instructor's first-ever view of a document that had only ever received a `.docx` import — no rapid cycling involved). Root cause: `y-websocket`'s `getYDoc()` (`node_modules/y-websocket/bin/utils.js`) calls `persistence.bindState()` without awaiting it, so `setupWSConnection` can hand a connection a still-empty in-memory `Y.Doc` while `bindState`'s own `Document.findUnique()` + `Y.applyUpdate()` restore is still in flight (a cold Neon round trip, observed ~1.9s). If that connection closes before the restore finishes, `y-websocket`'s `closeConn` immediately calls `persistence.writeState()`, which used to encode and persist the still-empty doc — silently overwriting real, previously-good `yjsState` with an empty encoding. Import-created rooms (`docxImport.ts`) were the realistic trigger: per the room-eviction limitation below, such a room is never evicted from memory until something eventually restarts the server, and its first real connection afterward is very often a brief read-only instructor view — exactly the fast-connect/fast-disconnect shape the race needs. Fixed in `server/src/collab/persistence.ts`: a per-room `restoreReady` promise, set synchronously in `bindState` before its first `await`, that `writeState` now awaits before ever persisting — so a room's state can never be written until its own restore has had the chance to apply. Regression test: `server/test/persistenceRestoreRace.test.ts` (seeds real import-only content, forces the exact race via a delayed `prisma.document.findUnique`, and asserts the content survives; fails against the pre-fix code, reproducing the original loss).

## Admin user management (IMPLEMENTED)
The admin area is accounts and the system only. It never shows class, group, report, grade or dispute content: the Overview is account counts (`GET /api/admin/overview` returns `{ users }` only) and there is no "Browse classes".
- **List** (`AdminPage.tsx`, `GET /api/admin/users`): role, status (active/inactive) and last-active (7d/30d/never) filters, sort by name / joined / last active (nulls last), search, former-member toggle. Query values are whitelisted in `server/src/lib/adminUsersQuery.ts`, shared with the CSV export. Filters, sort and page live in the URL (`client/src/lib/adminUsersUrl.ts`, other params like `?section=` are preserved); `/` focuses the search box (not while typing or with a dialog open).
- **`User.lastLoginAt`** (migration `20261023100000_user_last_login`, nullable): set on sign-in and, at most once an hour, on session refresh (`server/src/lib/lastLogin.ts`). Existing accounts read "Never" until their next sign-in. Display only.
- **Safer actions:** role change asks first; Deactivate applies at once with a 10 s Undo toast (it only sets `active` again: deactivation revokes no tokens, the auth middleware reads `active` from the DB on every request, so Undo restores the same session; `adminDeactivateUndo.test.ts`); Delete explains the account is anonymised and the work stays in reports as "Former member". The signed-in admin has no controls on their own row and the server returns 403 for self role change / deactivate / delete.
- **Details panel** (`AdminUserDetails.tsx`, `GET /api/admin/users/:id/details`): account facts plus class and group **counts** only.
- **Bulk deactivate** (`POST /api/admin/users/bulk-status`, max 100): skips the caller, former members and accounts already in that state, one audit row each, returns `updated` so Undo reverses exactly those.
- **Export CSV** (`GET /api/admin/users/export.csv`): the current filtered, sorted list (name, email, role, status, joined, last active); formula-safe cells, UTF-8 BOM, capped at 5000 rows, audited as `USERS_EXPORTED` (counts only).

## Instructor approval (IMPLEMENTED)
Instructor accounts are gated on admin sign-off. Students and admins are unaffected.
- `User.instructorStatus` (`PENDING | APPROVED | REJECTED`, default `APPROVED` so existing users and seed data are approved) plus `approvalReviewedAt` / `approvalReviewedById`. Registering as `INSTRUCTOR` (`routes/auth.ts`) creates the account as `PENDING`.
- **The guard reads the database, not the JWT.** `requireRole` (`middleware/auth.ts`) looks up `instructorStatus` and `active` for INSTRUCTOR callers on every request, so approval or rejection takes effect immediately without waiting for the 15-minute token refresh. Pending/rejected callers get 403 with `code: "INSTRUCTOR_PENDING"` / `"INSTRUCTOR_REJECTED"`. Because it lives in `requireRole`, every instructor route is covered; routes guarded only by `requireAuth` + ownership (`groups.ts`, `documents.ts`, `comments.ts`, collab WebSocket) are unreachable for unapproved instructors since they cannot own a class.
- A pending or rejected instructor can log in; `App.tsx` renders `PendingApprovalPage` instead of the app shell. `/api/auth/*` returns `instructorStatus`.
- Admin: `GET /api/admin/instructor-approvals`, `POST .../:id/approve` (from PENDING or REJECTED), `POST .../:id/reject` (from PENDING only). Each writes an `AuditLog` entry (`INSTRUCTOR_APPROVED` / `INSTRUCTOR_REJECTED`) and an in-app `Alert` to the instructor (no email). UI: `InstructorApprovals.tsx` in the admin Hierarchy section; the `USER_REGISTERED` notification links to `/admin?section=instructor-approvals`.
- There is no instructor-to-department link on `User` (departments attach only through `ClassSection`), so approval does not assign a department.

## Readability rules
Follow these for all new UI (`client/src/components/ui/styles.ts` implements most of them). The scale is applied by remapping Tailwind's theme tokens in `client/src/index.css` (`text-sm`/`text-base` = 13px, `text-lg` = 14px, `text-xl`/`text-2xl` = 20px; `text-xs` = 12px), so prefer the standard `text-*` utilities over arbitrary `text-[Npx]` values.
- Font: Geist, self-hosted via `@fontsource-variable/geist` (imported in `main.tsx`; no Google Fonts request), with a `system-ui` fallback. Use tabular numbers (`tabular-nums`; tables get it globally) for numbers in tiles, tables, shares and Gini values.
- Font sizes in rem. Body text, names and list numbers 13px (0.8125rem); secondary text, meta, chips, pills and axis labels 12px (0.75rem) — nothing below 12px; card titles 14px semibold; page titles 20px semibold; tile numbers 20px semibold.
- Sentence-case labels, not all caps.
- Text contrast at least 4.5:1. No pale grey text.
- Buttons 32-36px tall (`min-h-9`); clickable rows and nav items at least 40px (`min-h-10`).
- Card padding 16px, gaps between cards 16px, corner radius 12px, subtle 1px borders, minimal shadows.
- Cards in the same grid row must be equal height (`items-stretch`, cards `h-full`, content top-aligned).
- Visible focus outline on every interactive element.
- Never color alone: statuses and pills always include text.
- No horizontal scroll at 375px width or 200% zoom.
- Exceptions to the compact scale, pinned explicitly so the token remap does not touch them: the FairTraze Docs writing area (`.ft-doc-content`, ~16px body), print/PDF output (`PrintableReport`, `@media print`), and the public landing page (wrapped in `.ft-legacy-scale`).

## Help and documentation (IMPLEMENTED)
Short, on-demand help; nothing explains itself in a paragraph on a busy screen.
- **(?) tips:** `ui/InfoTip.tsx` (click-toggled, 1–2 sentences). An optional `helpHref` adds "More in Help", opened in a **new tab** so help never replaces a form or dialog. All tip texts live in `client/src/lib/helpText.ts` (numbers owned by the scoring code are passed in, never typed; `helpText.test.ts` enforces ≤ 2 sentences and no Gini wording in student-visible tips). Consequence lines (e.g. "Saving marks every group's report as outdated until you re-analyze", the one-time template choice) stay inline on purpose.
- **`/help` page** ("How FairTraze works", `pages/HelpPage.tsx`): public like `/privacy`, For students / For instructors switch (default from the signed-in role), anchors listed in `HELP_ANCHORS` (the test checks each exists). Weights, thresholds and multipliers are **imported from `shared/`**, so it cannot drift from the scoring code. The student view never shows the Gini value.
- **Entry points:** a **Help** item in the sidebar for every role (`navModel.getNavItems`) and one shared `components/AppFooter.tsx` (the "Outputs are evidence… not grades" note, one wording, plus a "How FairTraze works" link) used by every signed-in page.
- Student-facing wording: students see "note" (Add a note, Send note, Note status); instructor screens, routes and models keep "dispute".
- **Shell and search:** signed in, `/help` renders inside the app shell (sidebar with Help highlighted, shared `AppFooter` without its self-link, no Back button); logged-out visitors keep the standalone page (`usesShell(pathname, signedIn)` in `App.tsx`). `/help` stays exempt from the consent gate, like `/privacy`. A search box ("Search help…", Esc clears) filters sections (read from the rendered text) and FAQ questions as you type (`lib/helpSearch.ts`: case-insensitive, hyphens and punctuation ignored, every word must match), highlights matched words with the CSS Custom Highlight API (no DOM changes), announces the result count, and shows "No results. Try 'flags' or 'tasks'." when empty. The FAQ lives in `lib/helpFaq.ts` (numbers imported from `shared/`, no Gini wording). Check: `client/e2e/helpPage.mjs` (screenshots to `ux-audit/after/help__*`).
- Draft, plan and the lines-weighting check are in `ux-audit/` (`BATCH5_PLAN.md`, `HELP_DRAFT.md`, `LINES_WEIGHTING_CHECK.md`).

## Group setup: create first, link GitHub afterwards (IMPLEMENTED)
A GitHub or Combined group can be created with no repository and no GitHub username; the student group page then guides setup. Planning/guidance only: nothing here is read by scoring, `shared/` scoring files or the analyzer's maths.
- **`Project.repoUrl` is nullable** (migration `20261022100000_group_repo_optional`; old `''` rows become NULL). "No repo" is `null`; every reader uses `!!repoUrl`. Docs-only groups never have or need one. `create-group` no longer takes `repoUrl`, and neither create nor join requires `User.githubUsername` any more (step 3 of the setup card handles it). The legacy `Member.githubUsername` row is still written at create time (may be `""`); `analyze.ts` reads live `User.githubUsername` for the roster.
- **Link or change:** `PUT /api/groups/:id/repo` (`routes/groups.ts`; rate-limited 10/min per user by `repoLinkLimiter`). Any **member** may add the first link; once linked **only the leader** may change it; the instructor/admin is view-only (403); Docs-only groups get 400. Checks, in order: permission, format (`shared/src/repoUrl.ts#checkRepoUrl`, shared with the client's live check, canonical `https://github.com/owner/repo`), same-repo no-op, then existence/readability on GitHub (`lib/githubRepoCheck.ts#checkRepoReachable`, one `GET /repos/{owner}/{repo}` with the server token; kept out of `lib/github.ts`). Not found/private is 422 `REPO_NOT_FOUND` and ends "Make the repository public, or ask your instructor how to share it." Every link/change writes an `AuditLog` row (`GROUP_REPO_LINKED` / `GROUP_REPO_CHANGED`, targetType `GROUP`, details old -> new) and a `GROUP_REPO_CHANGED` alert (migration `20261022100100_group_repo_alert_type`) to the other members; the owning instructor is told about a *change*, not the first link.
- **A changed repo marks the latest report outdated** ("Repository changed. Re-analyze to update."): the route sets `membershipChangedAt` (the existing stale marker) when a report exists and the URL changed, and `lib/repoChange.ts` derives `repoChanged` at read time from the audit row being newer than the latest report (no new column; re-analyzing clears it). Exposed as `repoChanged` on `/api/projects/summary` and the stored report; the first link never marks anything.
- **Analysis without a repo** answers `409 { code: "REPO_NOT_LINKED", error: "Link a GitHub repository first." }` before streaming starts (`analyze.ts`, a guard only). The instructor sees a "Repo not linked yet" pill on the group card (`hasRepo` on the summary), Analyze/Re-analyze disabled, a notice instead of "Analysis failed" on the group page, and bulk analyze skips and names such groups (`lib/repoNotice.ts` holds the wording).
- **Setup placement (nudge and gate):** the card no longer renders inline on any tab. `setupNudge` (`lib/groupSetup.ts`) gives one slim line above the tabs (`SetupNudgeBar.tsx`: "Setup 2 of 3" plus the viewer's own next action; with no repo linked every member's action is to paste the link, matching the server) with a "Finish setup" button that opens the full steps in a focus-trapped dialog. A leader whose group needs a repo that is not linked first sees `SetupGate.tsx` before the tabs, with "Do this later" (remembered per user and group in localStorage, `lib/setupSkip.ts`); the bar never depends on that skip, and Docs, Tasks and Report are never blocked. Docs-only groups see none of it.
- **Setup card** (`components/GroupSetupCard.tsx`, pure logic in `lib/groupSetup.ts`, data from `GET /api/groups/:id/setup`, members only): 3 steps with "n of 3 done" (create a repo how-to; paste the link with a live format check and the server check; "n of m members linked" with missing **display names only** and a link to the viewer's own Settings field, `/settings?edit=github`). Step 1 counts as done when the link is saved (creation cannot be observed). Shown on every tab only while incomplete and never for Docs-only groups. When complete it becomes the calm **Next step** line (`lib/nextStep.ts`: the viewer's overdue tasks, or the soonest day with tasks due, from the existing tasks query; hidden when there is nothing to say; finishing setup in a visit shows a one-time "Setup complete ✓" toast, remembered per user and group in localStorage). No AI, no new request.
- Checks: `client/e2e/groupSetupCard.mjs` (local; screenshots to `ux-audit/after/student__setup-*`). Server tests (`groupRepoOptional`, `groupRepoLink`, `groupSetupStatus`) are written but were not run against the shared test database when added.

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

## Tasks board (COMPLETE: phases 1-8 built; closing cleanup deferred until after the defense, pending owner sign-off)
A Jira-like **Tasks tab** on every group page (Board, List, Calendar and the task details window now; commit auto-link, workload, bulk edit and the instructor class cards come in later phases). **Planning data only: tasks never change a contribution score, flag, Gini value, team health or the AI narrative input, and nothing in `shared/` scoring reads them.**
- **Model** (`server/prisma/schema.prisma`): `Task` gained `number` (per-group, the "12" in "FT-12"), `status` (`TODO|IN_PROGRESS|IN_REVIEW|DONE`), `priority`, `dueDate` (calendar date, no time zone; "today" is Asia/Manila), `position` (double; a card dropped between two others takes the midpoint, the column is renumbered when the gap is < 1e-6), `version` (bumped by every write), `milestoneId`, `docHeading`. `Project.taskKey` (nullable; derived from the group name's initials by `server/src/lib/taskKey.ts` and persisted when the first task is created; the SQL backfill uses the same rule) and `Project.nextTaskNumber`. New tables: `TaskMilestone`, `TaskLabel`/`TaskLabelLink`, `TaskActivity` (History; ids and values only, never names). The legacy `done` flag is kept in sync from `status` by one writer (`statusFields` in `lib/taskBoard.ts`) until a later cleanup migration drops it. Migrations: `20261018100000_task_board_fields` (backfills status/number/order/key from existing rows; tested in `server/test/taskBackfill.test.ts`), `20261018100100_task_milestones_labels`, `20261018100200_task_activity`.
- **Permissions** are decided only on the server by `server/src/lib/taskPermissions.ts` and mirrored per task in the API (`task.permissions`); the client never decides. Leader: everything (create, edit, assign, move any task, delete, bulk edit, milestones/labels). Assigned member: edit own task (until Done), move it among To do / In progress / In review, change its due date. Entering or leaving Done, and moving unassigned tasks: leader only. Any member can create a task (forced unassigned, To do). The instructor who OWNS the class and admins are view-only; a group with no assignment has no owning instructor, so other instructors get 403 (the new routes do not inherit the assignment-less-group gap documented in `projects.ts`).
- **API** (`server/src/routes/tasks.ts`): `GET /api/groups/:id/tasks` returns the whole board in one payload (weak ETag, `Cache-Control: private, no-cache`: an unchanged 10 s poll is a 304); `POST .../tasks`, `PATCH .../tasks/:taskId` (needs `expectedVersion`; a stale version is 409 `VERSION_CONFLICT` with the current task, never a silent overwrite), `POST .../tasks/:taskId/move` (status and order), `POST .../tasks/bulk`, milestones and labels CRUD, `DELETE`. `PUT` and `PATCH {done}` are **temporary aliases for old tabs** (same rules; an assignee can no longer mark Done) and are removed in the final cleanup. Task creation is limited to 30/min per user (`taskWriteLimiter`).
- **Client** (`client/src/components/tasks/`): `TasksTab` (also mounted read-only on the instructor/admin `ProjectDetailPage`), `Board` with `@dnd-kit` (mouse, touch, keyboard; Space picks up, arrows move, Space drops, Esc cancels; screen-reader announcements), optimistic moves with a toast and Undo (`useTaskActions`), top bar filters, milestone strip. (The per-column "Add task" quick add was removed in phase 4: only "New task" at the top and the C shortcut create tasks.) `?tab=tasks&task=<id>` deep-links (task alerts use it). The replaced `TaskManageModal` is gone; `client/src/lib/taskWorkload.ts` (`suggestAssignee`, display-only, leader-only in the new UI) feeds the role-aware suggested assignee in the details window.
- **Phase 3 (List, Calendar, bulk edit, shortcuts):** a Board / List / Calendar switch (`ViewSwitch`), remembered per user in localStorage (try/catch) and mirrored to `?view=` by `TasksTab` itself (`lib/tasks/view.ts`; the URL wins). `ListView` is a sortable table (`aria-sort`, `lib/tasks/sort.ts`) that scrolls in its own box. **Bulk edit** (leader only, List view): `BulkBar` over `POST .../tasks/bulk`; only tasks currently visible count as selected; status and assignee changes ask first (`BulkConfirmDialog`, no Undo exists); the route now checks permission per task and returns `{ tasks, skipped: [{ taskId, key, reason }] }` (a task over the 5-label limit is skipped instead of failing the batch; unknown ids, a non-member assignee or a foreign label/milestone still fail the whole call). `CalendarView` is a Sunday-first month grid (roving tabindex; dnd-kit drag changes only `dueDate` through `updateTask`, with Undo). Calendar dates are `YYYY-MM-DD` strings handled with UTC arithmetic and the deadline is converted with `manilaDateOf`, so no time zone can shift a day. Shortcuts (`hooks/useTaskShortcuts.ts`): C, /, J, K, ?, Esc; never while typing (text inputs, textarea, select, contenteditable), with Ctrl/Cmd/Alt, or while a dialog is open. J and K move real focus to the next task's title button (`data-task-open`), so Enter opens it natively. No migration.

- **Phase 4 (Task details window):** the old side panel is replaced by `components/tasks/details/TaskDetailsModal.tsx`, a centered ~980px dialog (full screen under 640px, dimmed board behind, focus trap, Esc returns focus to the card/row/chip that opened it, body scroll locked). Opened from any view and by `?task=`; header shows the key, "N of M" in the current view's order **and filters** (`orderedIds` from `TasksTab`), previous/next buttons and J/K, Watch with the watcher count. Left column: title, description (@mentions), subtasks, attachments, Comments / History tabs. Right column: status, assignee (+ leader-only **Suggested** assignee), priority and due date, milestone, labels, linked document heading, watchers, Delete. **Controls the viewer may not use are disabled with a tooltip and a screen-reader note naming who can** (`lib/tasks/permissionText.ts` only explains `task.permissions`; the client never decides).
  - **Migrations:** `20261019100000_task_details_alert_types` (enum only: `TASK_MENTIONED`, `TASK_COMMENTED`, `TASK_STATUS_CHANGED`), `20261019100100_task_details_tables` (`TaskSubtask`, `TaskAttachment`, `TaskComment`, `TaskWatcher`, plus a backfill that makes every existing task's creator and assignee a watcher; tested in `server/test/taskWatchersBackfill.test.ts`).
  - **API** (`server/src/routes/taskDetails.ts`, mounted after `tasksRouter`): `GET .../tasks/:taskId/details` (subtasks, attachment metadata, storage, comments, watchers, History newest first; weak ETag, polled every 10 s while the window is open), subtasks (`POST`, `PATCH`, `DELETE`, `PUT .../subtasks/order`; need the task's edit permission; 30 per task; do not bump `Task.version`), attachments (raw-body `POST ...?filename=`, parser registered in `app.ts` before `express.json()`, **same sniffing/filename rules as the project brief** via `lib/briefAttachments.ts`: 1 MB image, 5 MB PDF, **5 per task, 50 MB per group**; `GET` serves the bytes with nosniff + sandbox CSP for PDFs; `DELETE`), comments (`POST/PATCH/DELETE`; any member can comment, **edit/delete own only**, 2000 chars, `<@userId>` mention tokens validated against group members, **`taskCommentLimiter` 30/min per user in its own bucket**), `PUT/DELETE .../watch`. Mentions in a task description are validated too (400 for a non-member) and notified for newly added ones.
  - **Watchers:** creator, assignee (create, edit, bulk assign) and commenters auto-watch; members can watch/unwatch. Only current group members receive watcher notifications.
  - **Notifications** (`lib/taskWatchers.ts`, always `collapse: true` per task, the actor is never notified, link = the task deep link): assigned (existing `TASK_ASSIGNED`); `TASK_MENTIONED` always; `TASK_COMMENTED` and `TASK_STATUS_CHANGED` to watchers only (a comment skips anyone already notified by a mention; a reorder inside one column is not a status change).
  - **History** stores ids/values only; `lib/tasks/activityText.ts` writes the sentence ("Ana moved it from To do to In progress · Oct 15, 10:40 AM") from the live board, and a removed member reads "a former member". New types: `subtask_added/done/reopened/removed`, `comment_added`, `attachment_added/removed` (a plain string column, no migration).
  - **Mentions** (`lib/tasks/mentions.ts`, `MentionTextarea.tsx`): the box shows `@Name` and the stored text has `<@userId>`; names are looked up live; a token for someone no longer in the group renders as "a former member" and is turned into plain text on edit so a save is never rejected.
  - **Suggested assignee** (`lib/taskWorkload.ts#suggestAssigneeForTask`, display only): a task linked to a document heading or labelled "Documentation" goes to Documentation members, else Developers; fewest open tasks wins, ties by name; reason names the real roles; fallback "Fewest open tasks (1); no Documentation member". Never auto-assigns; never touches a score.
  - **Linked document heading:** `GET /api/groups/:id/document/headings` (members, owning instructor, admin) decodes the **saved** `Document.yjsState` into a throwaway `Y.Doc` via `lib/documentHeadings.ts` (reusing `readDocumentStructure`) and returns H1/H2 texts in order: strictly read-only, never creates the Document row, never calls `getYDoc()`, no Yjs update/EditEvent/session (`server/test/documentHeadings.test.ts`). It lags live typing by the persistence debounce. "Open in document" switches to the Document tab (`useDocHeadingFocus`) and `DocumentEditor`/`DocumentGate` take an optional `scrollToHeading` (matches the trimmed heading text against the editor's own TOC list after sync; client-only navigation). If it is not found the document stays at the top and `LinkedHeadingNotice` says "That heading was renamed or removed" and lets the leader/assignee pick another. No change to `server/src/collab/`.
  - **Privacy:** the data export now includes the user's task comments and attachment **metadata only** (no bytes); account erasure scrubs the user's identity from their comment text and removes their watcher rows.

- **Phase 5 (commit linking and task keys):** migration `20261020100000_task_commit_links` (`TaskCommitLink`, `TaskKeyAlias`, `Project.commitsRefreshedAt`; do not edit it once applied, add a new migration instead). Planning data only: commit **messages** (first line), never diffs; no `shared/` change; nothing here is read by scoring, the analysis or the AI narrative.
  - **Linker** (`server/src/lib/taskCommitLinks.ts`): `parseTaskRefs` matches `KEY-123` for the group's current key and every alias, case-insensitive, with word boundaries ("XFT-1", "FT-1abc", "FT-1_x" do not count). Only the group's own repo and only existing task numbers link. Idempotent through the unique `(taskId, sha)` row; one `commit_linked` History entry per new link (`actorId` null). Merge commits are skipped by the reader (`lib/githubCommitMessages.ts`, separate from the scoring fetch in `lib/github.ts`; newest 1000 commits, at most 10 API calls).
  - **Analyze hook:** `linkCommitsBestEffort` runs after the report is saved in the GITHUB and COMBINED paths of `analyze.ts`. It never throws, and it makes no GitHub call at all when the group has no tasks or the server has no token, so it cannot fail or slow an analysis for groups that do not use tasks.
  - **Leader Refresh:** `POST /api/groups/:id/tasks/sync-commits` (leader only, repo groups only). Once per 5 minutes per group, claimed atomically through `Project.commitsRefreshedAt` (429 with `retryAfterSeconds` and a `Retry-After` header; a failed GitHub read gives the cooldown back). Creates no `Report`, `Alert`, score or analysis data and never touches `scoringConfigChangedAt` or `membershipChangedAt`.
  - **Task key change:** `PATCH /api/groups/:id/task-key` (leader only). The old key becomes a `TaskKeyAlias`, so commits that still say `FT-12` keep linking; display always uses the current key. A key this group used before cannot be reused (409). A key that was never shown (no task ever created) gets no alias.
  - **UI:** the board payload carries `group.hasRepo`, `commitsRefreshedAt`, `keyAliases` and the real `commitCount` per task. `CommitLinkBar` under the board explains linking, shows "Last refreshed 3 min ago" and the leader's Refresh commits and Change task key controls; the details window has a Linked commits section (short sha linking to GitHub, first line, author, time) and History reads "Commit a41f9c2 was linked".
  - **Not done here (phase 8):** commit links are not yet in the personal-data export or scrubbed on erasure (the author login is personal data).
- **Phase 6 (remaining notifications):** migrations `20261021100000_task_alert_types_phase6` (enum only: `TASK_IN_REVIEW`, `TASK_DUE_SOON`, `TASK_OVERDUE`) and `20261021100100_task_notification_log` (`TaskNotificationLog`, unique on task + person + kind + due date). Planning data only; nothing here is read by scoring.
  - **Moved to In review:** `notifyStatusChange` (`lib/taskWatchers.ts`) also tells the group **leader** (always, whether or not they watch; `TASK_IN_REVIEW`, collapsed per task, the actor never). The leader then gets that alert instead of the plain status-change one. It covers the move, legacy-done and bulk paths, which all call it.
  - **Due tomorrow / overdue** (`lib/taskDueSweep.ts`): to the assignee only, for tasks that are not Done, with a due date of tomorrow (`TASK_DUE_SOON`) or before today (`TASK_OVERDUE`), where the assignee is still an active member. **Manila calendar days.** Each (task, person, kind, due date) is announced once: the unique `TaskNotificationLog` row is claimed first, so the hourly sweep and the lazy sweep can overlap safely, and a changed due date can announce again. `runTaskDueSweep(now, { projectId })` is the testable body.
  - **Two triggers:** an hourly in-process sweep (`startTaskDueSweep()`, `setInterval(...).unref()`, started only from `index.ts`, so tests never run a timer) and a **lazy sweep** after `GET /api/groups/:id/tasks` (that group only, at most every 10 minutes per process, started after the response is sent and never awaited, because the host may sleep through the hourly timer). The lazy sweep is off under `NODE_ENV=test` unless a test switches it on (`setLazySweepEnabled`).
- **Phase 7 (workload and class-page task cards):** read-only counts of planning data; a task count is never a measure of contribution and nothing here is read by scoring.
  - `GET /api/groups/:id/tasks/workload` (`routes/taskOverview.ts`; leader, the instructor who owns the class, admins; members get 403): per member open / overdue / due this week (Sunday to Saturday, Manila) / in review / done, plus unassigned. Pure maths in `lib/taskOverviewSummary.ts`. `WorkloadPanel` opens from a **Workload** button in the Tasks top bar (leader, instructor, admin) or from `?workload=1`.
  - `GET /api/assignments/:id/task-summary` (owning instructor, admin; `assertOwnsAssignment`): per group total / done / overdue and milestone progress. It is a separate endpoint, so `ProjectSummaryItem` in `shared/` is untouched. `GroupTaskCards` on `AssignmentPage` shows each group's "X of Y tasks done", overdue (text + icon), milestone mini-bars, three buttons (Open tasks, Workload, Open report) and "Planning only. Not part of the contribution score."
- **Phase 8, safe parts (done):** the personal-data export now carries all task data (status, priority, due date, milestone, labels, watches, your History, @mentions of you as message text only, commit links carrying your login, attachment **metadata only**). **Erasure** scrubs the person's name, email and login from task titles/descriptions, others' comments that used their name in plain text, subtask titles, attachment file names, commit-link messages and the free-text values in History, nulls their login on commit links and deletes their watcher and reminder-log rows. **Attachment bytes are kept** (the files are the group's work; the privacy notice says so) and nothing is deleted, so no task, comment, count or score changes (`server/test/taskPrivacy.test.ts`). `server/test/taskScoringIsolation.test.ts` asserts that scoring files and `gemini.ts` never mention tasks, that `analyze.ts` reads no task table (its only task import is the best-effort linker, after the report is saved) and that analysis output and the AI prompt are identical with and without tasks, comments, files, watchers and commit links. `client/e2e/taskLayout.mjs` (local, in `test:e2e`) checks the Tasks tab at 375px and at 200% zoom: no sideways page scroll, nothing past a dialog's edge, no text under 12px, visible focus, 32px targets (calendar chips are 24px, the WCAG 2.2 minimum). It found and fixed a real overflow: absolutely positioned hidden text inside the board escaped its scroll box and stretched the page to ~1160px at 375px (`Board.tsx` region is now `relative`). **`PRIVACY_NOTICE_VERSION` is now 1.1 (2026-10-19)**, bumped for Tasks data (assignments, due dates, commit links, reminder log); the bump re-prompts every user for consent on their next login.
  - **Deferred until after the defense (needs owner sign-off):** the drop-`done` contract migration and removal of the temporary `PUT` / `PATCH {done}` aliases. Tasks is otherwise complete.

## Stack
- **client**: React + Vite + TypeScript + Tailwind + Recharts — an instructor-facing dashboard
- **server**: Express + TypeScript + Prisma (PostgreSQL, hosted on Neon) + Octokit (GitHub) + Yjs (Collaborative Editor) + Gemini API
- **shared**: shared TypeScript types and the deterministic scoring module

## Data model (Prisma)
The full schema (`server/prisma/schema.prisma`) is substantially larger than the original prototype — `User`, `ClassSection`, `ClassEnrollment`, `Assignment`, `GroupMembership`, `GroupJoinRequest`, `RoleSuggestion`, `Alert`, `Dispute`, `AuditLog`, `Document`, `EditEvent`, `EditSession`, and `Comment` are all real models, not just `Project`/`Member`/`Report`. The three below are the original core and remain central to the GitHub-side pipeline:
- `Project { id, groupName, name, repoUrl, assignmentLabel, assignmentId, scoringConfigChangedAt, createdAt }` — the "Group" in the target Institutional Hierarchy below. It still carries the **legacy** `weightCommits/weightLines/weightActiveDays, freeRiderThreshold/overloadThreshold/deadlineDrivenThreshold, weightGithub/weightDocs` columns, but they are no longer read or written: scoring settings now live on `Assignment` (same column names). `scoringConfigChangedAt` stays on the group as the stale marker.
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
- `RawMemberStats`: commits, additions, deletions, commitDates, plus optional `codeLinesAdded?`, `commentLinesAdded?`, `blankLinesAdded?` (populated by the GitHub diff fetch; display counts), plus `weightedAdditions?`, `selfChurnRatio?`
- `ScoredMember`: commits, additions, deletions, churn, activeDays, lastPhaseRatio, commitShare, linesShare, activeDaysShare, contributionShare, codeLinesAdded, commentLinesAdded, blankLinesAdded, codeToCommentRatio, flags
- `Flag` = "inactive" | "free-rider" | "overload" | "deadline-driven"
- `TeamReport`: members, memberCount, gini, teamHealth ("Healthy" | "Moderate Risk" | "High Risk")
- `ScoringWeights`: commits (0.4), lines (0.4), activeDays (0.2) — `lines` was formerly `churn`

## Meaningful Contribution Analysis (`shared/src/lineClassifier.ts`)
Since scoring rules version 2 the scored line signal (weight 0.4) is `effectiveAdditions` = Σ added lines × **line-type weight** (`LINE_TYPE_WEIGHTS`: code 1.0, comment 0.25, blank 0) × file-type weight × commit-impact multiplier × (1 − 0.5 × self-churn ratio). `github.ts` applies the line-type weight in the real pipeline; `meaningfulLines = code + 0.25 × comment` (blank 0, same constants) remains the fallback when `weightedAdditions` is absent (`shared` tests). Before version 2 every added line counted equally. See `ux-audit/LINES_WEIGHTING_CHECK.md` (historical).

- `classifyAddedLines(filename, addedLines)` in `shared/src/lineClassifier.ts` classifies each added line as `"code"`, `"comment"`, or `"blank"` using language-aware comment markers derived from the file extension. Supported: js/ts/jsx/tsx/java/c/cpp/cs/go/rs (`//`, `/*`), py/rb/sh/yaml (`#`), html/xml (`<!--`), sql/lua (`--`), css/scss/less (`/*`). Unknown extensions: all lines count as code.
- The GitHub fetch (`server/src/lib/github.ts`) samples up to **100 commits per member** via `GET /repos/{owner}/{repo}/commits/{sha}`, parses the diff patch for lines starting with `+` (not `++`), and accumulates classified line totals.
- Blank lines contribute **zero** and comment lines a quarter, both in the displayed `meaningfulLines` and in the real score (`weightedAdditions`); file-type weights, commit-impact classes and the self-churn discount apply on top.
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

### Merge commits are excluded (approved change to scoring *inputs*)
`fetchCommitShasAndDates` (`server/src/lib/github.ts`) reads `parents` from the commit-list response (no extra API calls) and drops any commit with more than one parent **before** the `COMMIT_DIFF_SAMPLE_CAP` slice, so the 100-commit sample is filled with real authored commits. Excluded merges contribute nothing to added lines, `fileTypeBreakdown`, `commitImpactBreakdown`, `weightedAdditions`, `commitDates`/active days, or the required-login fallback's commit count. Single-parent squash/rebase merges are real authored commits and are kept.

**Why:** the commit endpoint diffs a merge against its first parent, so it carries everything the merged branch brought in. A leader merging teammates' branches was credited with their lines (and a 1.5× `structural` multiplier), double-counting work already credited to its authors; it also made the commit count (stats API, which excludes merges) inconsistent with the line/impact basis. Like the authorship fix, this changes scoring *inputs* only — the formulas in `shared/` are untouched. Reports generated before this change may include merge diffs until re-analyzed. The member drawer's Commit impact section states the exclusion.

**Known limitation:** manual conflict-resolution work done inside a merge commit is not counted.

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
When `weightedAdditions` is absent (e.g. in existing tests), `effectiveAdditions` falls back to `meaningfulLines`.

### Scoring rules version 2 (approved change; `SCORING_RULES_VERSION = 2`)
**Scoring rules version 2** (`SCORING_RULES_VERSION`, `shared/src/scoringRules.ts`) bundles: line-type weighting in real runs; Docs weights 0.6/0.2/0.2; a Docs active day needs 30+ retained characters written that day; and active days (GitHub and Docs) are **Asia/Manila** calendar days via one helper, `shared/src/analysisDay.ts` (`analysisDayOf`; the same time zone as the task due sweep). The deadline/last-third window uses exact timestamps, not days, so it is unchanged. Each new report stores `scoringRulesVersion` in `Report.content`; reports without it (or older) are flagged `rulesOutdated` **at read time** (never recomputed): instructors see "Scoring was updated. Re-analyze to apply the new rules."; students see one calm line "This report uses older scoring rules. It updates when your instructor re-analyzes." Bump the constant for any future change that alters scores.

## Audience and tone
The user is an **instructor**. Both the UI and the AI report must be professional, factual, fair, and **non-accusatory** — describe patterns and cite evidence, never moralize or accuse. Privacy is a stated system value; demo data should use anonymized member names (e.g. "Member A").

## Terminology (from the capstone paper)
- **Contribution Profiling**: building participation profiles from activity records.
- **Participation Imbalance Detection**: identifying free-riding, workload concentration, minimal involvement, and deadline-driven activity.
- **Explainable AI**: outputs that provide transparent explanations and supporting evidence for the system's analysis.

## Institutional Hierarchy (target structure)

**Partially implemented.** `ClassSection`, `Assignment`, `GroupMembership`, `User`, `Department`, and `Report` all exist and match this shape today. `Department` is fully implemented — a real Prisma model (`server/prisma/schema.prisma`), with CRUD in `AdminPage.tsx` and a selector in `InstructorDashboardPage.tsx`; `ClassSection` has both `departmentId` and `instructorId`. **Not implemented:** the `School` level above `Department`, and the `Project` → `Group` rename (the model is still called `Project` in the live schema). Do not build School or rename `Project` without an explicit task instruction.

Note: `Department` is organizational metadata for grouping class sections, not an access-control boundary — data isolation between instructors is enforced by instructor ownership (`server/src/lib/ownership.ts`'s `assertOwnsClass`/`assertOwnsAssignment`, checking `classSection.instructorId`), not by `departmentId`.

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
| *(none)* | `School` | `Department` is already implemented and wired via `ClassSection.departmentId`; `School` is the only structural level genuinely not built. |

### Phase mapping

- **Phase A — Auth & Roles** *(IMPLEMENTED)*: `User` model, email/password auth (bcryptjs + JWT), `AuthContext`, `ProtectedRoute`, `/dashboard` authenticated area. `analyze`/`narrative` endpoints now enforce `requireRole("INSTRUCTOR")` plus ownership checks (see `analyze.ts`). Deferred: Google OAuth (see "Identity & Authentication").
- **Phase B — Team Formation** *(IMPLEMENTED)*: `ClassSection`, `Assignment`, `GroupMembership`; join-code flow; student group creation (LEADER) and joining (MEMBER); leader reassignment (`POST /api/groups/:id/reassign-leader`); member removal/leave (`DELETE /api/groups/:id/members/:userId`); `GroupManageModal` on both instructor and student views. Analyzer and scoring unchanged. `School` hierarchy deferred (`Department` is implemented).
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
Scoring weights and flag thresholds are configured **per project (applies to GitHub and Combined projects)**: they are `Assignment` columns (`weightCommits`, `weightLines`, `weightActiveDays`, `freeRiderThreshold`, `overloadThreshold`, `deadlineDrivenThreshold`, `weightGithub`, `weightDocs`) and apply to every group in that project. Only the owning instructor can edit them (admins can read, not edit) via `ScoringSettingsModal.tsx` → `PATCH /api/assignments/:id/scoring-config` (opened from the project page and from a group report; `PATCH /api/projects/:id/config` remains as a thin alias that writes the group's assignment). Editor-only projects have no settings. Analysis reads the settings from the group's assignment and snapshots the value used into each report's `scoringConfig`, so old reports keep the settings they were scored with; saving changed values marks every group's report stale (`Project.scoringConfigChangedAt`) and `/api/projects/summary` reports `settingsOutdated` per group by comparing the stored snapshot to the current settings. The values below are the defaults, **not empirically validated**.

| Parameter | Default | Meaning |
|---|---|---|
| Commit weight | 0.4 | Share of contributionShare from commit count |
| Lines weight | 0.4 | Share from effectiveAdditions (`meaningfulLines` only as a fallback) |
| Active days weight | 0.2 | Share from distinct active days |
| Free-rider threshold | 0.5 × equalShare | Below this → free-rider flag |
| Overload threshold | 1.75 × equalShare | Above this → overload flag |
| Deadline-driven threshold | 0.6 (lastPhaseRatio) | > 60% of commits in final third |
| Healthy Gini | < 0.2 | Low inequality |
| Moderate Risk Gini | 0.2 – 0.4 | Moderate inequality |
| High Risk Gini | ≥ 0.4 | High inequality |

### Historical trend & benchmarking — IMPLEMENTED
Each analyze run creates a new `Report` row (no uniqueness constraint on `projectId`), so a group's Gini/team-health history accumulates across runs. `GET /api/projects/:id/report/history` (`server/src/routes/projects.ts`) returns that history; the instructor dashboard renders it as `TrendChart` in `ProjectDetailPage.tsx`, shown only once at least 2 runs exist.

Separately, `client/src/lib/benchmark.ts`'s `computeAssignmentBenchmark()` compares a group's Gini against the average Gini of other analyzed groups **under the same assignment** (shown as a ▲/▼ note in `TeamHealthBanner.tsx`). This is a same-assignment average, not cross-section or institutional analytics — that remains unbuilt (see Phase F below).

## Identity & Authentication

**Identity is anchored to the User account (IMPLEMENTED).** The GitHub username is a self-registered attribute on the `User` model (`githubUsername String?`). Editor activity is captured under the logged-in `User`. This is how the system unifies identity across data sources — there is no per-group re-registration of platform usernames.

**Authentication method.** Only email/password + JWT is implemented (`server/src/routes/auth.ts`, bcryptjs + JWT). **Google OAuth does not exist in this codebase** — there is no OAuth client, callback route, or Google-related dependency anywhere in `server/` or `client/`. If OAuth sign-in is wanted, treat it as new work, not a fix to something broken.

## Profile photos (IMPLEMENTED, optional)
`User.avatarData/avatarMime/avatarUpdatedAt` (nullable, stored in Postgres because Render's disk is ephemeral). The client crops to a square, resizes to 256x256 and re-encodes to WebP/JPEG <=~200KB (`client/src/lib/avatarImage.ts`; re-encoding strips EXIF/GPS). `PUT/DELETE /api/users/me/avatar` re-validate magic bytes and size; `GET /api/users/:id/avatar` is authenticated (self, admin, group-mates, the class's instructor) with ETag + `?v=<avatarUpdatedAt>` caching (`server/src/routes/avatar.ts`). `Avatar.tsx` falls back to initials everywhere. Display only; no scoring effect.

## Student Agency (IMPLEMENTED — Phase C)

Students get a **read-only view of their own contribution report** — they can see their scores and flags but a regular member cannot see other members' individual data (`StudentGroupPage.tsx`, `GET /api/student/group/:projectId`). The one exception is the group's **leader**: the server adds a whitelisted `report.team` view (each member's share, GitHub/Docs split, flags, open/done task counts) to the response only when the caller's `GroupMembership.role` is `LEADER`, so work can be distributed fairly. Dispute details and instructor notes are never included. Display-only, never a scoring input. They have one action: **"Flag for review / add a note"**, which submits a short free-text note to the instructor (`Dispute` model, `disputes.ts`, `DisputesPage.tsx`). The instructor is notified and retains final authority.

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
