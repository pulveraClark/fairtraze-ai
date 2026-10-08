import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";

export interface MyGroup {
  id: number;
  groupName: string;
  repoUrl: string;
  role: "LEADER" | "MEMBER";
  report: { gini: number | null; teamHealth: string | null; generatedAt: string } | null;
}

export interface AssignmentSummary {
  id: number;
  title: string;
  deadline: string | null;
  sourceType: string;
  maxGroupSize: number;
  myGroup: MyGroup | null;
}

export interface EnrolledClass {
  id: number;
  subjectCode: string;
  subjectName: string;
  department: { id: number; name: string; code: string } | null;
  edpCode: string;
  joinCode: string | null;
  joinedAt: string;
  assignments: AssignmentSummary[];
}

export const STUDENT_CLASSES_KEY = "student-classes";

/**
 * GET /api/student/classes — the student's enrolled classes with their own group per
 * assignment. Shared by StudentPage and the sidebar tree so it is a single cached request.
 */
export function useStudentClassesQuery(enabled = true) {
  const { token, user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: [STUDENT_CLASSES_KEY, userId],
    queryFn: async (): Promise<EnrolledClass[]> => {
      const res = await fetch("/api/student/classes", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load your classes.");
      const data = (await res.json()) as { classes: EnrolledClass[] };
      return data.classes;
    },
    enabled: enabled && !!token && userId !== null,
  });
}
