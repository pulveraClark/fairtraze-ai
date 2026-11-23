import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { disputeKeys } from "./useGroupQueries";
import { useInvalidateOnAlertCount } from "./useInvalidateOnAlertCount";

/**
 * Number of open disputes in the instructor's own classes (sidebar badge). Instructor only: any
 * other role makes no request and gets 0. No interval of its own: a new dispute changes the
 * Notifications unread count (the existing 30 s poll), and resolving one invalidates
 * disputeKeys.all, which includes this key.
 */
export function useOpenDisputeCount(): number {
  const { token, user } = useAuth();
  const uid = user?.id ?? null;
  const enabled = !!token && uid !== null && user?.systemRole === "INSTRUCTOR";

  const query = useQuery({
    queryKey: disputeKeys.open(uid),
    queryFn: async () => {
      const res = await fetch("/api/disputes/open-count", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Could not load open disputes.");
      const data = (await res.json()) as { openCount?: number };
      return data.openCount ?? 0;
    },
    enabled,
  });
  useInvalidateOnAlertCount(enabled ? [disputeKeys.open(uid)] : []);

  return enabled ? query.data ?? 0 : 0;
}
