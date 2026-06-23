export interface StudentEnrollment {
  assignmentLabel: string;
  groupName: string;
  projectName: string;
  assignmentTitle: string;
  deadline: string;
  sourceType: "GitHub" | "FairTraze Docs" | "Combined";
  teamHealth: "Healthy" | "Moderate Risk" | "High Risk";
  lastAnalyzed: string;
  contribution: {
    share: number;
    commits: number;
    activeDays: number;
    linesAdded: number;
    linesDeleted: number;
    flags: string[];
    gini: number;
    equalShare: number;
    memberCount: number;
  };
}

const ENROLLMENTS: Record<string, StudentEnrollment> = {
  "CC-APPSDEV22": {
    assignmentLabel: "CC-APPSDEV22 — Applications Development",
    groupName: "Group 1",
    projectName: "FairTraze AI",
    assignmentTitle: "Final Application Project",
    deadline: "Jul 15, 2026",
    sourceType: "GitHub",
    teamHealth: "Healthy",
    lastAnalyzed: "Jun 15, 2026",
    contribution: {
      share: 0.22,
      commits: 14,
      activeDays: 8,
      linesAdded: 1240,
      linesDeleted: 320,
      flags: [],
      gini: 0.18,
      equalShare: 0.25,
      memberCount: 4,
    },
  },
  "IT-IMDBSYS32": {
    assignmentLabel: "IT-IMDBSYS32 — Information Management 2 (Database Systems)",
    groupName: "Group 2",
    projectName: "PersonalFinanceTracker",
    assignmentTitle: "Database Systems Project",
    deadline: "Jul 20, 2026",
    sourceType: "GitHub",
    teamHealth: "Moderate Risk",
    lastAnalyzed: "Jun 14, 2026",
    contribution: {
      share: 0.18,
      commits: 9,
      activeDays: 5,
      linesAdded: 890,
      linesDeleted: 210,
      flags: ["deadline-driven"],
      gini: 0.31,
      equalShare: 0.25,
      memberCount: 4,
    },
  },
};

export function getStudentEnrollment(code: string): StudentEnrollment | null {
  return ENROLLMENTS[code] ?? null;
}

export function getAllStudentEnrollments(): (StudentEnrollment & { code: string })[] {
  return Object.entries(ENROLLMENTS).map(([code, e]) => ({ ...e, code }));
}
