// Mirrors Prisma schema models
export interface Project {
  id: number;
  name: string;
  repoUrl: string | null;
  createdAt: Date;
}

export interface Member {
  id: number;
  projectId: number;
  studentName: string;
  githubUsername: string;
}

export interface Report {
  id: number;
  projectId: number;
  generatedAt: Date;
  gini: number | null;
  teamHealth: number | null;
  content: string | null;
}

// Scoring pipeline types

export interface RawMemberStats {
  studentName: string;
  githubUsername: string;
  commits: number;
  additions: number;
  deletions: number;
  commitDates: string[]; // ISO timestamps
  // Code/comment/blank line counts. Display only in real runs; the lines share is built from weightedAdditions below.
  // (They feed meaningfulLines, which scoring.ts uses only as a fallback when weightedAdditions is absent.)
  codeLinesAdded?: number;
  commentLinesAdded?: number;
  blankLinesAdded?: number;
  // Contribution significance (optional; populated by enhanced GitHub diff fetch)
  weightedAdditions?:     number;
  selfChurnRatio?:        number;
  commitImpactBreakdown?: { structural: number; functional: number; cosmetic: number; trivial: number };
  fileTypeBreakdown?:     { source: number; test: number; docs: number; style: number; config: number; other: number };
}

export type Flag = "inactive" | "free-rider" | "overload" | "deadline-driven";

// Functional roles — context only; never affect contribution scores, Gini, or flags.
// DEVELOPER  → expected source: GitHub (active now)
// DOCUMENTATION → expected source: FairTraze Docs (active now)
export type FunctionalRole = "DEVELOPER" | "DOCUMENTATION";

export interface MemberRoleInfo {
  userId:          number;
  githubUsername:  string;
  functionalRoles: FunctionalRole[];
  isLeader:        boolean;
  // Soft informational notes for the instructor when a member's activity doesn't match
  // their assigned role(s). Never a contribution flag; never changes any score.
  // Empty array = no mismatch. A member holding both DEVELOPER and DOCUMENTATION can
  // mismatch on both at once — each gets its own entry, none overwrite each other.
  mismatchNotes: string[];
  // Leader/instructor-assigned checklist completion (server/src/routes/groups.ts Task
  // endpoints). Purely informational, self-reported — never a scoring input, same as
  // mismatchNotes above. { completed: 0, total: 0 } when no tasks are assigned.
  taskSummary: { completed: number; total: number };
  // Optional profile photo version (ISO timestamp), null/absent = initials fallback. Display only.
  avatarUpdatedAt?: string | null;
}

export type TeamHealth = "Healthy" | "Moderate Risk" | "High Risk";

export interface ScoredMember {
  studentName: string;
  githubUsername: string;
  commits: number;
  additions: number;
  deletions: number;
  churn: number;
  activeDays: number;
  lastPhaseRatio: number;
  commitShare: number;
  linesShare: number;    // share of effectiveAdditions (weightedAdditions x self-churn discount); meaningfulLines only as a fallback
  activeDaysShare: number;
  contributionShare: number;
  // Line breakdown (display; not the scored quantity in real runs)
  codeLinesAdded: number;
  commentLinesAdded: number;
  blankLinesAdded: number;
  codeToCommentRatio: number | null; // null when no code or no comments written
  // Contribution significance: weightedAdditions = sum over commits of (added lines x file-type weight) x commit-impact multiplier
  weightedAdditions:     number;
  selfChurnRatio:        number;
  commitImpactBreakdown: { structural: number; functional: number; cosmetic: number; trivial: number };
  fileTypeBreakdown:     { source: number; test: number; docs: number; style: number; config: number; other: number };
  flags: Flag[];
}

export interface TeamReport<M = ScoredMember> {
  members: M[];
  memberCount: number;
  gini: number;
  teamHealth: TeamHealth;
  // Discloses which basis produced the deadline-driven flag's "last third" window for this
  // report: anchored to the real Assignment.deadline, or (when no deadline is set) falling
  // back to a 2/3 split of the group's own observed activity span. Never per-member — one
  // window applies to the whole report.
  deadlineWindowBasis: "assignment-deadline" | "activity-span";
}

export interface ScoringWeights {
  commits: number;
  lines: number;      // weight applied to the lines share (effectiveAdditions; was churn)
  activeDays: number;
}

export interface ScoringThresholds {
  freeRider: number;      // fraction of equal share; below → free-rider flag (default 0.5)
  overload: number;       // multiple of equal share; above → overload flag (default 1.75)
  deadlineDriven: number; // lastPhaseRatio above this → deadline-driven flag (default 0.6)
}

export interface ProjectScoringConfig {
  weights: ScoringWeights;
  thresholds: ScoringThresholds;
  // Only ever set for COMBINED projects' persisted scoringConfig snapshot; always populated on
  // currentConfig (server/src/routes/projects.ts) regardless of sourceType. Optional so historical
  // GITHUB/EDITOR report snapshots (which never set it) remain valid.
  blend?: BlendWeights;
}

// ── Document (FairTraze Docs) scoring pipeline types — mirrors RawMemberStats/ScoredMember ──

// Raw per-member input built from EditEvent/EditSession replay (server/src/collab/editStats.ts).
// userId is the authoritative identity — EditEvent.userId/EditSession.userId are User.id.
// githubUsername may be "" for EDITOR members (not required at join time) — display only, never a lookup key.
export interface RawDocumentMemberStats {
  studentName: string;
  userId: number;
  githubUsername: string;
  retainedChars: number;       // net chars this user currently owns in the live document
  totalInsertedChars: number;  // gross chars inserted (selfChurnRatio denominator)
  totalDeletedChars: number;   // gross chars this user deleted (any owner)
  selfDeletedChars: number;    // of totalDeletedChars, how many they originally inserted themselves
  sessionCount: number;
  sessionDates: string[];      // ISO EditSession.startedAt values — analogous to commitDates
  // Characters written on each Asia/Manila day (key YYYY-MM-DD) that are still in the final
  // document. Drives the "active day" count (MIN_ACTIVE_DAY_RETAINED_CHARS). Optional: when absent
  // (older fixtures/callers) active days fall back to the distinct days of sessionDates.
  retainedCharsByDay?: Record<string, number>;
  // Edit-type significance (Step 4b; optional so existing test fixtures without them still compile)
  weightedRetainedChars?: number;
  editTypeBreakdown?: { substantive: number; revision: number; formatting: number; trivial: number };
  // .docx-import scoring (step 3; optional, falls back to pre-step-3 behavior when absent)
  liveSessionCount?: number;              // EditSession count with source: LIVE only; falls back to sessionCount when absent
  importedRetainedChars?: number;         // of retainedChars, how many originated from source: IMPORT rows (unweighted, for display)
  importedWeightedRetainedChars?: number; // of weightedRetainedChars, the IMPORT-origin portion (drives session credit)
  // Gross count of image nodes this user inserted (net new, not decremented on delete). Disclosed
  // on the report only — never enters contributionShare or any share/weight formula. Optional so
  // existing test fixtures without it still compile.
  insertedImageCount?: number;
}

export interface DocumentScoredMember {
  studentName: string;
  userId: number;
  githubUsername: string;
  sessionCount: number;
  totalInsertedChars: number;
  totalDeletedChars: number;
  retainedChars: number;
  effectiveRetainedChars: number; // retainedChars after self-churn discount
  churn: number;                  // totalInsertedChars + totalDeletedChars
  activeDays: number;
  lastPhaseRatio: number;
  sessionShare: number;       // log-scaled session-count share (mirrors commitShare)
  retainedTextShare: number;  // mirrors linesShare
  activeDaysShare: number;
  contributionShare: number;  // same field name as the GitHub side, so generic UI reads it unchanged
  selfChurnRatio: number;
  // Edit-type significance (Step 4b)
  weightedRetainedChars: number;
  editTypeBreakdown: { substantive: number; revision: number; formatting: number; trivial: number };
  flags: Flag[];
  // .docx-import scoring (step 3)
  importedRetainedChars: number; // echoes the raw imported count used in importNote's {N}
  importNote: string | null;
  // Image insertion disclosure — never scored, purely echoed for display (see MemberTable.tsx).
  insertedImageCount: number;
}

export type DocumentTeamReport = TeamReport<DocumentScoredMember>;

// Dedicated weights type — not a reuse of ScoringWeights, since that type's field names
// (commits/lines/activeDays) don't semantically fit the document pipeline's signals.
export interface DocumentScoringWeights {
  retainedText: number;
  sessions: number;
  activeDays: number;
}

// ── Combined (GitHub + Docs) scoring pipeline types ──────────────────────────

// Blend weights for COMBINED-sourceType projects. Must sum to 1.0 (validated at the API layer,
// same pattern as ScoringWeights). Default 50/50 — see shared/src/combinedScoring.ts.
export interface BlendWeights {
  wGitHub: number;
  wDocs: number;
}

export interface CombinedScoredMember {
  studentName: string;
  userId: number;
  githubUsername: string;
  // Each member's share within its own source's independent normalization (0 when no
  // matching record/activity on that source — never null/undefined).
  githubContributionShare: number;
  documentContributionShare: number;
  wGitHub: number;
  wDocs: number;
  // Same field name as ScoredMember/DocumentScoredMember so generic UI (ContributionChart, the
  // primary MemberTable row) reads it unchanged. This IS the blended combinedContributionShare.
  contributionShare: number;
  // Computed over the UNIFIED timeline (GitHub commit dates + document session dates combined),
  // not either source's own lastPhaseRatio.
  lastPhaseRatio: number;
  flags: Flag[];
  // Full per-source breakdowns, for the report's sub-figure display. null = no matching scored
  // record on that source (member never appears in that source's roster/report).
  github: ScoredMember | null;
  document: DocumentScoredMember | null;
}

export type CombinedTeamReport = TeamReport<CombinedScoredMember>;
export type AnyScoredMember = ScoredMember | DocumentScoredMember | CombinedScoredMember;

// API shapes

export interface AnalyzeResponse {
  projectId: number;
  repoUrl: string | null;
  analyzedAt: string;
  unmatchedGitHubLogins: string[];
  report: TeamReport<AnyScoredMember>;
  narrative: string | null; // null when no narrative has been generated yet
}

export interface NarrativeResponse {
  narrative: string;
  cached: boolean;
  warning?: string;
}

// Dashboard summary — returned by GET /api/projects/summary.
// Never calls GitHub; reads stored report data only.
export interface ProjectSummaryItem {
  projectId: number;
  groupName: string;      // student team name, e.g. "Group 1" — the group's single name
  assignmentLabel: string;
  classId: number | null;      // ClassSection.id — for breadcrumb navigation
  assignmentId: number | null; // Assignment.id   — for breadcrumb navigation
  // Real names for breadcrumbs and labels (display only; absent on older payloads and assignment-less projects).
  classCode?: string;        // ClassSection.subjectCode, e.g. "CC-APPSDEV22"
  classSubjectName?: string; // ClassSection.subjectName
  assignmentTitle?: string;  // Assignment.title
  // "GITHUB" | "EDITOR" | "COMBINED" | null (legacy projects without assignment).
  // Available even before any report exists — unlike report-derived fields below,
  // this doesn't depend on the project having been analyzed.
  sourceType: string | null;
  memberCount: number;
  teamHealth: TeamHealth | null;
  gini: number | null;
  memberShares: Array<{
    studentName: string;
    contributionShare: number;
    flags: Flag[];
  }>;
  flagsPresent: Flag[];
  lastAnalyzedAt: string | null;
  isAnalyzed: boolean;
  membershipChangedAt: string | null; // set when members are added/removed; compare to lastAnalyzedAt to detect stale reports
  scoringConfigChangedAt: string | null; // set when scoring config changes after last analyze
  // True when the latest report's stored scoringConfig differs from the project's (assignment's)
  // current settings. Always false for reports without a stored config (EDITOR, legacy).
  settingsOutdated: boolean;
  // True when the latest report was scored with older scoring rules (SCORING_RULES_VERSION). Computed
  // at read time; also covers EDITOR reports, which store no settings snapshot.
  rulesOutdated: boolean;
  /** A GitHub/Combined group with a linked repository. Display only. */
  hasRepo?: boolean;
  /** The repository was changed after the latest report (that report is outdated). Display only. */
  repoChanged?: boolean;
}

// Stored report — returned by GET /api/projects/:id/report.
// Reads the latest persisted analysis; no GitHub fetch.
export interface StoredReportResponse {
  projectId: number;
  assignmentId: number | null; // the project (Assignment) whose scoring settings apply to this group
  groupName: string;  // student team name — the group's single name
  repoUrl: string | null;
  analyzedAt: string;
  report: TeamReport<AnyScoredMember>;
  narrative: string | null;
  unmatchedGitHubLogins: string[];
  sourceType: string | null; // "GITHUB" | "EDITOR" | "COMBINED" | null (legacy projects without assignment)
  // Scoring config stored with the report (what produced these numbers)
  scoringConfig: ProjectScoringConfig | null;
  // Current project config (may differ from scoringConfig if changed after last analyze)
  currentConfig: ProjectScoringConfig;
  // Set when config was changed after the last analysis run; cleared by re-analyze
  scoringConfigChangedAt: string | null;
  // Set when members were added/removed after the last analysis run; cleared by re-analyze
  membershipChangedAt: string | null;
  // Functional roles + soft mismatch notes per member (context only — never changes scores)
  memberRoles: MemberRoleInfo[];
  // Computed at read time (never stored): true when an EDITOR/COMBINED group's document has
  // EditEvents recorded before AUTHORSHIP_FIX_AT, i.e. before the authorship-capture offset fix.
  docsDataApproximate?: boolean;
  // Computed at read time (never stored): the report was scored with older scoring rules.
  rulesOutdated?: boolean;
  // Computed at read time: the linked repository was changed after this report was generated.
  repoChanged?: boolean;
  docsDataFixedAt?: string; // ISO date of the fix, for the notice text
}

// One point in a project's analysis history — returned by GET /api/projects/:id/report/history.
// Read-only over already-computed, already-stored Report rows; no new scoring.
export interface ReportHistoryPoint {
  generatedAt: string;
  gini: number | null;
  teamHealth: TeamHealth | null;
}

export interface ReportHistoryResponse {
  history: ReportHistoryPoint[];
}
