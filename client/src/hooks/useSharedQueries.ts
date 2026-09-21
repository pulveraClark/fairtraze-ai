import { useQuery } from "@tanstack/react-query";
import type { ProjectSummaryItem } from "@shared/types";

/**
 * /api/projects/summary is independently fetched by InstructorDashboardPage, ClassPage,
 * and ProjectDetailPage. Sharing one cached query means navigating between these pages
 * (e.g. dashboard -> project -> dashboard) reuses the already-fetched data instead of
 * re-issuing a full blocking request every time.
 */
export function useProjectsSummaryQuery(token: string | null) {
  return useQuery({
    queryKey: ["projects-summary"],
    queryFn: async () => {
      const res  = await fetch("/api/projects/summary", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Could not load project summary.");
      const data = (await res.json()) as { summary: ProjectSummaryItem[] };
      return data.summary;
    },
    enabled: !!token,
  });
}

/**
 * /api/classes — the instructor's own class-section list. Fetched independently today by
 * InstructorDashboardPage and DisputesPage (for its class filter dropdown); each caller
 * supplies its own shape for the response since the two pages use different subsets of
 * the class fields.
 */
export function useClassesListQuery<T = unknown>(token: string | null) {
  return useQuery({
    queryKey: ["classes-list"],
    queryFn: async (): Promise<T[]> => {
      const res  = await fetch("/api/classes", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Could not load classes.");
      const data = (await res.json()) as { classes: T[] };
      return data.classes;
    },
    enabled: !!token,
  });
}
