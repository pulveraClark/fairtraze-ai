import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD } from "./ui";

interface DeletionRequestState {
  id: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  reviewNote: string | null;
}

const LINK =
  "font-medium text-indigo-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

/** Settings > Privacy and data: download your data (RA 10173 access/portability) and request erasure. */
export function PrivacySettingsCard() {
  const { user, token } = useAuth();
  const [request, setRequest] = useState<DeletionRequestState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"download" | "request" | "cancel" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const auth = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!token) return;
    fetch("/api/privacy/deletion-request", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => (res.ok ? ((await res.json()) as { request: DeletionRequestState | null }) : null))
      .then((data) => setRequest(data?.request ?? null))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!confirming) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirming(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming]);

  async function download() {
    setBusy("download");
    setMessage(null);
    try {
      const res = await fetch("/api/privacy/export", { headers: auth });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fairtraze-my-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage({ kind: "ok", text: "Your data was downloaded." });
    } catch {
      setMessage({ kind: "error", text: "Could not download your data. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function submitRequest() {
    setBusy("request");
    setMessage(null);
    try {
      const res = await fetch("/api/privacy/deletion-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { request?: DeletionRequestState; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not send your request.");
      setRequest(data.request ? { ...data.request, reviewNote: null } : null);
      setConfirming(false);
      setReason("");
      setMessage({ kind: "ok", text: "Your deletion request was sent to an administrator." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not send your request." });
    } finally {
      setBusy(null);
    }
  }

  async function cancelRequest() {
    setBusy("cancel");
    setMessage(null);
    try {
      const res = await fetch("/api/privacy/deletion-request", { method: "DELETE", headers: auth });
      if (!res.ok) throw new Error();
      setRequest(null);
      setMessage({ kind: "ok", text: "Your deletion request was withdrawn." });
    } catch {
      setMessage({ kind: "error", text: "Could not withdraw the request. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  const pending = request?.status === "PENDING";

  return (
    <section aria-labelledby="privacy-heading" className={`${CARD} p-4`}>
      <h2 id="privacy-heading" className="text-sm font-semibold text-slate-900">Privacy and data</h2>
      <p className="mt-1 text-sm leading-normal text-slate-800">
        Your rights under the Data Privacy Act (RA 10173). Read the{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className={LINK}>Privacy Notice</a>.
        {user?.consentVersion && <> You accepted version {user.consentVersion}.</>}
      </p>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mt-3 text-sm ${message.kind === "error" ? "text-red-700" : "text-emerald-800"}`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Download my data</h3>
          <p className="mt-0.5 text-sm text-slate-800">
            A JSON file with your profile, group memberships, your own contribution entries, your editing and commit
            summaries, tasks, notes you filed and notifications. It never includes other members' data.
          </p>
          <button type="button" onClick={() => void download()} disabled={busy !== null} className={`${BUTTON_SECONDARY} mt-2`}>
            {busy === "download" ? "Preparing…" : "Download my data"}
          </button>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-900">Delete my account</h3>
          <p className="mt-0.5 text-sm text-slate-800">
            An administrator reviews your request. Your name, email, GitHub username and photo are removed, but your
            contributions stay as "Former member" so your teammates' reports remain correct.
          </p>

          {pending ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="inline-flex min-h-9 items-center rounded-md border border-amber-300 bg-amber-50 px-2.5 text-xs font-medium text-amber-900">
                Pending review
              </span>
              <button type="button" onClick={() => void cancelRequest()} disabled={busy !== null} className={BUTTON_SECONDARY}>
                {busy === "cancel" ? "Withdrawing…" : "Withdraw request"}
              </button>
            </div>
          ) : (
            <>
              {request?.status === "REJECTED" && (
                <p className="mt-2 text-sm text-slate-800">
                  Your last request was not approved{request.reviewNote ? `: ${request.reviewNote}` : "."} You can submit a new one.
                </p>
              )}
              <button type="button" onClick={() => setConfirming(true)} disabled={busy !== null} className={`${BUTTON_SECONDARY} mt-2`}>
                Request account deletion
              </button>
            </>
          )}
        </div>

        <p className="border-t border-slate-200 pt-3 text-sm text-slate-800">
          To correct your name or GitHub username, use Edit in the Profile section above.
        </p>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" className={`${CARD} w-full max-w-md p-5`}>
            <h2 id="delete-dialog-title" className="text-lg font-semibold text-slate-900">Request account deletion?</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-normal text-slate-800">
              <li>An administrator must approve the request. Until then, nothing changes.</li>
              <li>When approved, you are signed out everywhere and cannot sign in again.</li>
              <li>Your name, email, GitHub username, photo and notes to the instructor are removed.</li>
              <li>
                Your contributions are <strong>anonymized, not deleted</strong>: they stay as "Former member" so your
                teammates' reports and scores do not change.
              </li>
              <li>Text you typed stays in your group's document without your name.</li>
            </ul>
            <label className="mt-4 block text-sm font-medium text-slate-900" htmlFor="delete-reason">
              Reason (optional)
            </label>
            <textarea
              id="delete-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
            />
            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <button ref={cancelRef} type="button" onClick={() => setConfirming(false)} className={BUTTON_SECONDARY}>
                Keep my account
              </button>
              <button type="button" onClick={() => void submitRequest()} disabled={busy !== null} className={BUTTON_PRIMARY}>
                {busy === "request" ? "Sending…" : "Send deletion request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
