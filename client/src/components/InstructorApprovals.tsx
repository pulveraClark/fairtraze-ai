import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, EmptyState, StatusPill } from "./ui";

interface PendingInstructor {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

interface ReviewedInstructor {
  id: number;
  name: string;
  email: string;
  status: "APPROVED" | "REJECTED";
  reviewedAt: string | null;
  reviewedByName: string | null;
}

interface ApprovalsData {
  pendingCount: number;
  pending: PendingInstructor[];
  recent: ReviewedInstructor[];
}

type Decision = "approve" | "reject";

const QUERY_KEY = ["admin-instructor-approvals"] as const;

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Admin queue for self-registered instructors. They stay locked out of instructor features until approved here. */
export function InstructorApprovals({ onToast }: { onToast?: (type: "success" | "error", msg: string) => void }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const sectionRef = useRef<HTMLElement>(null);

  const query = useQuery<ApprovalsData>({
    queryKey: QUERY_KEY,
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch("/api/admin/instructor-approvals", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as ApprovalsData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load instructor approvals.");
      return json;
    },
  });

  const review = useMutation({
    mutationFn: async ({ id, decision }: { id: number; decision: Decision }) => {
      const res = await fetch(`/api/admin/instructor-approvals/${id}/${decision}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save this decision.");
    },
    onSuccess: (_data, { decision }) => {
      onToast?.("success", decision === "approve" ? "Instructor approved." : "Instructor request rejected.");
    },
    onError: (err: Error) => onToast?.("error", err.message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  // Deep link from the "New instructor" admin notification: /admin?section=instructor-approvals
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("section") === "instructor-approvals") {
      sectionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
  }, []);

  const data = query.data;
  const pendingCount = data?.pendingCount ?? 0;
  const busyId = review.isPending ? review.variables?.id : undefined;

  return (
    <section ref={sectionRef} id="instructor-approvals" aria-labelledby="instructor-approvals-title" className="scroll-mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 id="instructor-approvals-title" className="text-lg font-semibold text-slate-900">Instructor approvals</h3>
        <span
          className="inline-flex min-w-6 items-center justify-center rounded-full bg-indigo-700 px-2 py-0.5 text-xs font-semibold text-white"
          aria-label={`${pendingCount} waiting for approval`}
        >
          {pendingCount}
        </span>
      </div>
      <p className="mb-4 text-sm leading-normal text-slate-700">
        New instructor sign-ups can log in but cannot use instructor features until you approve them.
      </p>

      {query.isLoading && <p className="text-sm text-slate-700">Loading approvals…</p>}

      {query.isError && (
        <div className={`${CARD} p-4`}>
          <p className="text-sm text-red-800">{query.error instanceof Error ? query.error.message : "Could not load instructor approvals."}</p>
          <button type="button" onClick={() => void query.refetch()} className={`${BUTTON_SECONDARY} mt-3`}>Try again</button>
        </div>
      )}

      {data && data.pending.length === 0 && (
        <EmptyState title="No instructors are waiting for approval" description="New instructor sign-ups will appear here." />
      )}

      {data && data.pending.length > 0 && (
        <ul className={`${CARD} divide-y divide-slate-200`}>
          {data.pending.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="break-words text-sm font-semibold text-slate-900">{p.name}</p>
                <p className="break-all text-sm text-slate-700">{p.email}</p>
                <p className="text-xs text-slate-700">Signed up {fmtDate(p.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => review.mutate({ id: p.id, decision: "approve" })}
                  className={BUTTON_PRIMARY}
                  aria-label={`Approve ${p.name}`}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => review.mutate({ id: p.id, decision: "reject" })}
                  className={BUTTON_SECONDARY}
                  aria-label={`Reject ${p.name}`}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && data.recent.length > 0 && (
        <div className="mt-5">
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Recently reviewed</h4>
          <ul className={`${CARD} divide-y divide-slate-200`}>
            {data.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="break-words text-sm font-semibold text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-700">
                    {r.email} · {fmtDate(r.reviewedAt)}{r.reviewedByName ? ` by ${r.reviewedByName}` : ""}
                  </p>
                </div>
                <StatusPill kind="status" label={r.status === "APPROVED" ? "Approved" : "Rejected"} tone={r.status === "APPROVED" ? "green" : "red"} />
                {r.status === "REJECTED" && (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => review.mutate({ id: r.id, decision: "approve" })}
                    className={BUTTON_SECONDARY}
                    aria-label={`Approve ${r.name}`}
                  >
                    Approve instead
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
