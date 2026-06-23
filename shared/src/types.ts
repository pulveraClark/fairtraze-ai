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

export interface TeamReport {
  members: ScoredMember[];
  memberCount: number;
  gini: number;
  teamHealth: TeamHealth;
}

export interface ScoringWeights {
  commits: number;
  lines: number;      // weight applied to meaningfulLines share (renamed from churn)
  activeDays: number;
}

// API shapes

export interface AnalyzeResponse {
  projectId: number;
  repoUrl: string;
  analyzedAt: string;
  unmatchedGitHubLogins: string[];
  report: TeamReport;
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
  groupName: string;      // student team name, e.g. "Group 1" — primary instructor-facing identifier
  name: string;           // app/project name, e.g. "FairTraze AI"
  assignmentLabel: string;
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
}

// Stored report — returned by GET /api/projects/:id/report.
// Reads the latest persisted analysis; no GitHub fetch.
export interface StoredReportResponse {
  projectId: number;
  groupName: string;  // student team name — primary identifier
  name: string;       // app/project name
  repoUrl: string;
  analyzedAt: string;
  report: TeamReport;
  narrative: string | null;
  unmatchedGitHubLogins: string[];
  sourceType: string | null; // "GITHUB" | "EDITOR" | "COMBINED" | null (legacy projects without assignment)
}
