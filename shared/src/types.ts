// Mirrors the Prisma schema models
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

// API shapes

export interface ContributorWeekStat {
  week: number;       // Unix timestamp of week start
  additions: number;
  deletions: number;
  commits: number;
}

export interface MemberStats {
  githubUsername: string;
  studentName: string | null;
  totalCommits: number;
  totalAdditions: number;
  totalDeletions: number;
  firstCommitAt: string | null;
  lastCommitAt: string | null;
  weeklyBreakdown: ContributorWeekStat[];
}

export interface AnalyzeResponse {
  projectId: number;
  repoUrl: string;
  analyzedAt: string;
  members: MemberStats[];
  unmatchedGitHubLogins: string[];
}
