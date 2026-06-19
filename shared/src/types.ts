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
  churnShare: number;
  activeDaysShare: number;
  contributionShare: number;
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
  churn: number;
  activeDays: number;
}

// API shapes

export interface AnalyzeResponse {
  projectId: number;
  repoUrl: string;
  analyzedAt: string;
  unmatchedGitHubLogins: string[];
  report: TeamReport;
}
