// Mirrors Prisma schema models
export interface Project {
  id: number;
  name: string;
  repoUrl: string;
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
  // Meaningful line classification (optional so existing tests compile without them)
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
// DOCUMENTATION → expected source: FairTraze Docs (planned — Phase D)
export type FunctionalRole = "DEVELOPER" | "DOCUMENTATION";

export interface MemberRoleInfo {
  githubUsername:  string;
  functionalRoles: FunctionalRole[];
  isLeader:        boolean;
  // Soft informational note for the instructor when a member's activity doesn't match
  // their assigned role.  Never a contribution flag; never changes any score.
  // null = no mismatch (or role not traceable yet)
  mismatchNote: string | null;
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
  linesShare: number;    // share of meaningfulLines (was churnShare)
  activeDaysShare: number;
  contributionShare: number;
  // Meaningful contribution breakdown
  codeLinesAdded: number;
  commentLinesAdded: number;
  blankLinesAdded: number;
  codeToCommentRatio: number | null; // null when no code or no comments written
  // Contribution significance
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
}

export interface ScoringWeights {
  commits: number;
  lines: number;      // weight applied to meaningfulLines share (renamed from churn)
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
  // Edit-type significance (Step 4b; optional so existing test fixtures without them still compile)
  weightedRetainedChars?: number;
  editTypeBreakdown?: { substantive: number; revision: number; formatting: number; trivial: number };
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
  repoUrl: string;
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
}

// Stored report — returned by GET /api/projects/:id/report.
// Reads the latest persisted analysis; no GitHub fetch.
export interface StoredReportResponse {
  projectId: number;
  groupName: string;  // student team name — the group's single name
  repoUrl: string;
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
}
