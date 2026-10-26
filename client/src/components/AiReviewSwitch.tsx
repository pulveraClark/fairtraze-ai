import { useState } from "react";
import { FOCUS_LIGHT } from "./ui";
import { InfoTip } from "./ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";

/**
 * Class page: the instructor's switch for AI work summaries. Applies at once (no confirm step);
 * if the server refuses, it goes back to the old state and says so in words.
 */
export function AiReviewSwitch({
  classId, enabled, token, onChanged,
}: {
  classId: number;
  enabled: boolean;
  token: string | null;
  onChanged: (next: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setSaving(true);
    setError(null);
    onChanged(next);
    try {
      const res = await fetch(`/api/classes/${classId}/ai-review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error("rejected");
    } catch {
      onChanged(!next);
      setError("Could not save this setting. It was not changed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={saving}
        onClick={toggle}
        className={`inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-60 ${FOCUS_LIGHT}`}
      >
        <span
          aria-hidden="true"
          className={`relative inline-block h-4 w-7 shrink-0 rounded-full ${enabled ? "bg-indigo-700" : "bg-slate-400"}`}
        >
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${enabled ? "left-3.5" : "left-0.5"}`} />
        </span>
        AI work summaries: {enabled ? "On" : "Off"}
      </button>
      <InfoTip label="About AI work summaries" helpHref={helpLink("ai")}>{TIPS.aiReviewClass}</InfoTip>
      {error && <p role="alert" className="w-full text-xs text-red-800">{error}</p>}
    </div>
  );
}
