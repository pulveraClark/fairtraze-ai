export interface SampleAssignment {
  id: string;
  title: string;
  deadline: string;
  sourceType: "GitHub" | "FairTraze Docs" | "Combined";
  joinCode: string;
}

// Keyed by the class code segment (from parseClassLabel)
const BY_CODE: Record<string, SampleAssignment> = {
  "CC-APPSDEV22": {
    id: "fa-2026",
    title: "Final Application Project",
    deadline: "Jul 15, 2026",
    sourceType: "GitHub",
    joinCode: "FT-AB12-CD34",
  },
  "IT-IMDBSYS32": {
    id: "db-2026",
    title: "Database Systems Project",
    deadline: "Jul 20, 2026",
    sourceType: "GitHub",
    joinCode: "FT-EF56-GH78",
  },
  "IT-ELEC 2": {
    id: "elec-2026",
    title: "IT Elective Project",
    deadline: "Jul 25, 2026",
    sourceType: "GitHub",
    joinCode: "FT-IJ90-KL12",
  },
};

const DEFAULT: SampleAssignment = {
  id: "proj-2026",
  title: "Group Project",
  deadline: "Jul 30, 2026",
  sourceType: "GitHub",
  joinCode: "FT-XX00-YY00",
};

export function getSampleAssignment(code: string): SampleAssignment {
  return BY_CODE[code] ?? DEFAULT;
}
