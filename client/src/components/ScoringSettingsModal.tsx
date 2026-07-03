import { useState, useEffect } from "react";
import type { ProjectScoringConfig } from "@shared/types";

const DEFAULTS: ProjectScoringConfig = {
  weights:    { commits: 0.4, lines: 0.4, activeDays: 0.2 },
  thresholds: { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 },
};

interface Props {
  projectId: number;
  currentConfig: ProjectScoringConfig;
  onClose: () => void;
  onSaved: (config: ProjectScoringConfig) => void;
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

export function ScoringSettingsModal({ projectId, currentConfig, onClose, onSaved }: Props) {
  const [commits,        setCommits]        = useState(currentConfig.weights.commits);
  const [lines,          setLines]          = useState(currentConfig.weights.lines);
  const [activeDays,     setActiveDays]     = useState(currentConfig.weights.activeDays);
  const [freeRider,      setFreeRider]      = useState(currentConfig.thresholds.freeRider);
  const [overload,       setOverload]       = useState(currentConfig.thresholds.overload);
  const [deadlineDriven, setDeadlineDriven] = useState(currentConfig.thresholds.deadlineDriven);

  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const weightSum = Math.round((commits + lines + activeDays) * 1000) / 1000;
  const sumOk     = Math.abs(weightSum - 1.0) <= 0.001;

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function resetToDefaults() {
    setCommits(DEFAULTS.weights.commits);
    setLines(DEFAULTS.weights.lines);
    setActiveDays(DEFAULTS.weights.activeDays);
    setFreeRider(DEFAULTS.thresholds.freeRider);
    setOverload(DEFAULTS.thresholds.overload);
    setDeadlineDriven(DEFAULTS.thresholds.deadlineDriven);
    setSaveError(null);
  }

  async function handleSave() {
    if (!sumOk) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weights:    { commits, lines, activeDays },
          thresholds: { freeRider, overload, deadlineDriven },
        }),
      });
      const data = (await res.json()) as { config?: ProjectScoringConfig; error?: string };
      if (!res.ok) {
        setSaveError(data.error ?? `Server error ${res.status}`);
        return;
      }
      onSaved(data.config!);
    } catch {
      setSaveError("Network error — could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Scoring Settings</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Adjust weights and thresholds for this group. The math stays the same — only the
              inputs change.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none ml-4"
          >
            &times;
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">

          {/* ── Contribution Weights ─────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Contribution Weights
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              These three values must sum to 1.0. They control how much each signal contributes
              to a member's overall contribution share.
            </p>

            <div className="space-y-4">
              <WeightRow
                label="Commits"
                description="Weight on log-scaled commit count. Commit frequency after diminishing-returns adjustment."
                value={commits}
                onChange={setCommits}
              />
              <WeightRow
                label="Lines (meaningful)"
                description="Weight on weighted, effective line additions — code counts more than comments; self-churn penalised."
                value={lines}
                onChange={setLines}
              />
              <WeightRow
                label="Active days"
                description="Weight on distinct calendar days with at least one commit. Rewards consistent participation over time."
                value={activeDays}
                onChange={setActiveDays}
              />
            </div>

            {/* Sum indicator */}
            <div className={`mt-3 flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2 ${
              sumOk
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              <span className="text-base leading-none">{sumOk ? "✓" : "✕"}</span>
              <span>
                Weights sum: <strong>{weightSum.toFixed(3)}</strong>
                {!sumOk && " — must equal 1.000"}
              </span>
            </div>
          </section>

          {/* ── Flag Thresholds ───────────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Flag Thresholds
            </h3>

            <div className="space-y-4">
              <ThresholdRow
                label="Free-rider threshold"
                description={`A member is flagged as a free-rider if their contribution share is below this fraction of the equal share. At ${pct(freeRider)}, a member must contribute at least ${pct(freeRider)} of what an equal split would expect.`}
                value={freeRider}
                onChange={setFreeRider}
                min={0.1}
                max={0.9}
                step={0.05}
        formatValue={(v) => `${pct(v)} of equal share`}
              />
              <ThresholdRow
                label="Overload threshold"
                description={`A member is flagged as overloaded if their contribution share exceeds this multiple of the equal share. At ${overload.toFixed(2)}×, one member doing ${pct(overload)} of expected equal work triggers the flag.`}
                value={overload}
                onChange={setOverload}
                min={1.1}
                max={4.0}
                step={0.05}
                formatValue={(v) => `${v.toFixed(2)}× equal share`}
              />
              <ThresholdRow
                label="Deadline-driven threshold"
                description={`A member is flagged as deadline-driven if more than this fraction of their commits fell in the final third of the project timeline. At ${pct(deadlineDriven)}, a member whose last-phase ratio exceeds ${pct(deadlineDriven)} is flagged.`}
                value={deadlineDriven}
                onChange={setDeadlineDriven}
                min={0.3}
                max={0.95}
                step={0.05}
                formatValue={(v) => `>${pct(v)} of commits in final third`}
              />
            </div>
          </section>

          {/* ── Reset ────────────────────────────────────────────────────────── */}
          <div className="flex justify-end">
            <button
              onClick={resetToDefaults}
              className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2 transition-colors"
            >
              Reset to defaults
            </button>
          </div>

          {/* Save error */}
          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-400 max-w-xs">
            Saving new settings marks the existing report stale. Re-analyze to apply them.
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!sumOk || saving}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface WeightRowProps {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
}

function WeightRow({ label, description, value, onChange }: WeightRowProps) {
  const display = Math.round(value * 100) / 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={display}
            onChange={(e) => onChange(Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)))}
            className="w-16 text-right text-xs font-mono border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-indigo-400"
          />
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full accent-indigo-600 cursor-pointer"
      />
      <p className="text-[11px] text-slate-400 mt-1">{description}</p>
    </div>
  );
}

interface ThresholdRowProps {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  formatValue: (v: number) => string;
}

function ThresholdRow({ label, description, value, onChange, min, max, step, formatValue }: ThresholdRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        <span className="text-xs font-mono text-indigo-700 bg-indigo-50 rounded px-1.5 py-0.5">
          {formatValue(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full accent-indigo-600 cursor-pointer"
      />
      <p className="text-[11px] text-slate-400 mt-1">{description}</p>
    </div>
  );
}
