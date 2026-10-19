import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, StatusPill } from "./ui";

interface RequestRow {
  id: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: { id: number; name: string; email: string; systemRole: string };
}

interface RequestsData {
  pendingCount: number;
  pending: RequestRow[];
  recent: RequestRow[];
}

type Decision = "approve" | "reject";

const QUERY_KEY = ["admin-deletion-requests"] as const;

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Admin queue for account-deletion requests (RA 10173). Approving anonymizes the account. */
export function DeletionRequests({ onToast }: { onToast?: (type: "success" | "error", msg: string) => void }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const sectionRef = useRef<HTMLElement>(null);

  const query = useQuery<RequestsData>({
    queryKey: QUERY_KEY,
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch("/api/admin/deletion-requests", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as RequestsData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load deletion requests.");
      return json;
    },
  });

  const review = useMutation({
    mutationFn: async ({ id, decision }: { id: number; decision: Decision }) => {
      const res = await fetch(`/api/admin/deletion-requests/${id}/${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: "{}",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save this decision.");
    },
    onSuccess: (_data, { decision }) => {
      onToast?.("success", decision === "approve" ? "Account anonymized." : "Deletion request rejected.");
    },
    onError: (err: Error) => onToast?.("error", err.message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  // Deep link from the admin notification: /admin?section=deletion-requests
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("section") === "deletion-requests") {
      sectionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
  }, []);

  function approve(row: RequestRow) {
    const ok = window.confirm(
      `Anonymize ${row.user.name}'s account?\n\nTheir profile, photo and sign-in are removed. Their contributions stay as "Former member" so teammates' reports are unchanged. This cannot be undone.`,
    );
    if (ok) review.mutate({ id: row.id, decision: "approve" });
  }

  const data = query.data;
  const pendingCount = data?.pendingCount ?? 0;
  const busyId = review.isPending ? review.variables?.id : undefined;

  // Nothing waiting and nothing reviewed yet: hide the whole section until it has content.
  if (data && data.pending.length === 0 && (data.recent?.length ?? 0) === 0) return null;

  return (
    <section ref={sectionRef} id="deletion-requests" aria-labelledby="deletion-requests-title" className="scroll-mt-4 rounded-lg border border-slate-200 p-4 sm:col-span-1 lg:col-span-2">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 id="deletion-requests-title" className="text-lg font-semibold text-slate-900">Deletion requests</h3>
        <span
          className="inline-flex min-w-6 items-center justify-center rounded-full bg-indigo-700 px-2 py-0.5 text-xs font-semibold text-white"
          aria-label={`${pendingCount} waiting for review`}
        >
          {pendingCount}
        </span>
      </div>
      <p className="mb-4 text-sm leading-normal text-slate-700">
        Users can ask to have their account deleted. Approving removes their profile and sign-in and keeps their
        contributions as "Former member". A group leader or an instructor who owns classes must hand those over first.
      </p>

      {query.isLoading && <p className="text-sm text-slate-700">Loading requests…</p>}

      {query.isError && (
        <div className={`${CARD} p-4`}>
          <p className="text-sm text-red-800">{query.error instanceof Error ? query.error.message : "Could not load deletion requests."}</p>
          <button type="button" onClick={() => void query.refetch()} className={`${BUTTON_SECONDARY} mt-3`}>Try again</button>
        </div>
      )}


      {data && data.pending.length > 0 && (
        <ul className={`${CARD} divide-y divide-slate-200`}>
          {data.pending.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="break-words text-sm font-semibold text-slate-900">{r.user.name}</p>
                <p className="break-all text-sm text-slate-700">{r.user.email}</p>
                <p className="text-xs text-slate-700">Requested {fmtDate(r.createdAt)}</p>
                {r.reason && <p className="mt-1 break-words text-sm text-slate-800">Reason: {r.reason}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => approve(r)}
                  className={BUTTON_PRIMARY}
                  aria-label={`Approve deletion for ${r.user.name}`}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => review.mutate({ id: r.id, decision: "reject" })}
                  className={BUTTON_SECONDARY}
                  aria-label={`Reject deletion for ${r.user.name}`}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && data.recent.length > 0 && (
        <>
          <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-900">Recently reviewed</h4>
          <ul className={`${CARD} divide-y divide-slate-200`}>
            {data.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                <span className="min-w-0 flex-1 basis-40 break-words text-sm text-slate-900">{r.user.name}</span>
                <StatusPill kind="status" label={r.status === "APPROVED" ? "Anonymized" : "Rejected"} tone={r.status === "APPROVED" ? "green" : "red"} />
                <span className="text-xs text-slate-700">{fmtDate(r.reviewedAt)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
