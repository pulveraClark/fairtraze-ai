import { Modal } from "./ui/Modal";
import { useAuth } from "../context/AuthContext";
import { useAdminUserDetailsQuery } from "../hooks/useAdminQueries";

export interface AdminUserRow {
  id:             number;
  name:           string;
  email:          string;
  systemRole:     "ADMIN" | "INSTRUCTOR" | "STUDENT";
  githubUsername: string | null;
  active:         boolean;
  lockedUntil:    string | null;
  createdAt:      string;
  lastLoginAt?:   string | null;
  deletedAt?:     string | null;
}

const ROLE_LABEL = { ADMIN: "Admin", INSTRUCTOR: "Instructor", STUDENT: "Student" } as const;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Account facts only. Class and group figures are counts, never names or content. */
export function AdminUserDetails({ user, onClose, restoreFocusTo }: {
  user: AdminUserRow | null; onClose: () => void; restoreFocusTo?: HTMLElement | null;
}) {
  const { token } = useAuth();
  const details = useAdminUserDetailsQuery(token, user?.id ?? null);
  if (!user) return null;

  const locked = !!user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now();
  const status = user.deletedAt ? "Deleted account" : user.active ? "Active" : "Inactive";
  const count = (n: number | undefined) =>
    details.isError ? "Unavailable" : details.isLoading || n === undefined ? "Loading…" : String(n);

  const rows: Array<[string, string]> = [
    ["Name", user.name],
    ["Email", user.email],
    ["Role", ROLE_LABEL[user.systemRole]],
    ["Status", locked ? `${status} (locked after failed sign-ins)` : status],
    ["Joined", fmt(user.createdAt)],
    ["Last sign-in", user.lastLoginAt ? fmt(user.lastLoginAt) : "Never"],
    ["GitHub username", user.githubUsername || "Not set"],
    ["Classes", count(details.data?.classCount)],
    ["Groups", count(details.data?.groupCount)],
  ];

  return (
    <Modal open onClose={onClose} title={`${user.name} - account details`} size="md" restoreFocusTo={restoreFocusTo}>
      <dl className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-700">{label}</dt>
            <dd className="min-w-0 break-words font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-slate-700">
        Counts only. The admin area never shows class, group or report content.
      </p>
    </Modal>
  );
}
