import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { groupKeys } from "./useGroupQueries";
import { taskApi } from "../lib/tasks/api";

/** Per-group task counts for one assignment (owning instructor and admins). Planning data only. */
export function useAssignmentTaskSummary(assignmentId: number) {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: groupKeys.assignmentTasks(user?.id ?? null, assignmentId),
    queryFn: () => taskApi.assignmentTaskSummary(token, assignmentId),
    enabled: !!token,
    retry: false,
  });
}
