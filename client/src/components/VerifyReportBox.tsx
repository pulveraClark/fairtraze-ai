import { useId, useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import {
  REPORT_ID_NOT_FOUND, VERIFY_LATEST_TEXT, VERIFY_OLDER_TEXT, type EvidenceVerifyResult,
} from "@shared/evidenceReport";
import { BUTTON_PRIMARY_COMPACT } from "./ui/styles";
import { flagsText, manilaDateTime, pctText } from "../lib/evidenceText";

/**
 * "Verify report": the owning instructor types the Report ID from a student's printout and sees the
 * same per-member numbers, plus whether that analysis is still the latest. Evidence only; the server
 * returns no Gini, bands or team health, so there is nothing here to hide.
 */
export function VerifyReportBox() {
  const { token } = useAuth();
  const inputId = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvidenceVerifyResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/evidence-reports/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<EvidenceVerifyResult> & { error?: string };
      if (!res.ok) setError(res.status === 404 ? REPORT_ID_NOT_FOUND : (json.error ?? "Could not check the report. Try again in a moment."));
      else setResult(json as EvidenceVerifyResult);
    } catch {
      setError("Could not check the report. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const showGithub = result ? result.sourceType !== "EDITOR" : false;
  const showDocs = result ? result.sourceType !== "GITHUB" : false;

  return (
    <section aria-label="Verify report">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="text-xs text-slate-700">Report ID on the student's printout</label>
          <input
            id={inputId}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="FT-7K2P-9X"
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            className="min-h-9 w-44 rounded-lg border border-slate-300 px-3 text-sm uppercase text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          />
        </div>
        <button type="submit" disabled={busy || !code.trim()} className={BUTTON_PRIMARY_COMPACT}>
          {busy ? "Checking…" : "Verify"}
        </button>
      </form>

      <div aria-live="polite" className="mt-3">
        {error && <p className="text-sm font-medium text-slate-900">{error}</p>}
        {result && (
          <div>
            <p className="text-sm font-semibold text-slate-900">
              <span aria-hidden="true">{result.status === "latest" ? "✓ " : "⚠ "}</span>
              {result.status === "latest" ? VERIFY_LATEST_TEXT : VERIFY_OLDER_TEXT}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {result.groupName} · {result.projectTitle} · Analyzed {manilaDateTime(result.analyzedAt)}
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-slate-700">
                    <th className="py-1 pr-3 font-semibold" scope="col">Member</th>
                    {showGithub && <th className="py-1 pr-3 text-right font-semibold" scope="col">GitHub</th>}
                    {showDocs && <th className="py-1 pr-3 text-right font-semibold" scope="col">Documents</th>}
                    <th className="py-1 pr-3 text-right font-semibold" scope="col">Combined</th>
                    <th className="py-1 font-semibold" scope="col">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {result.members.map((m, i) => (
                    <tr key={`${m.name}-${i}`} className="border-t border-slate-200">
                      <td className="py-1 pr-3 text-slate-900">{m.name}</td>
                      {showGithub && <td className="py-1 pr-3 text-right tabular-nums">{m.githubPct === null ? "—" : pctText(m.githubPct)}</td>}
                      {showDocs && <td className="py-1 pr-3 text-right tabular-nums">{m.docsPct === null ? "—" : pctText(m.docsPct)}</td>}
                      <td className="py-1 pr-3 text-right font-semibold tabular-nums">{pctText(m.combinedPct)}</td>
                      <td className="py-1">{flagsText(m.flags)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-700">Evidence only. Not a grade. The instructor decides.</p>
          </div>
        )}
      </div>
    </section>
  );
}
