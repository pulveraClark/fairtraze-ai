import { useState, useEffect } from "react";
import type { ProjectScoringConfig } from "@shared/types";
import { useToast } from "./Toast";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { BUTTON_SECONDARY_COMPACT } from "./ui/styles";
import { balanceWeights } from "../lib/balanceWeights";
import { InfoTip } from "./ui/InfoTip";
import { SETTINGS_TIPS, helpLink } from "../lib/helpText";

const DEFAULTS: ProjectScoringConfig = {
  weights:    { commits: 0.4, lines: 0.4, activeDays: 0.2 },
  thresholds: { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 },
  blend:      { wGitHub: 0.5, wDocs: 0.5 },
};

interface Props {
  /** The project (Assignment) whose settings are edited; they apply to every group in it. */
  assignmentId: number;
  currentConfig: ProjectScoringConfig;
  // "COMBINED" reveals the Source Blend section (wGitHub/wDocs); hidden for GITHUB/EDITOR-only.
  sourceType: string | null;
  onClose: () => void;
  onSaved: (config: ProjectScoringConfig) => void;
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

export function ScoringSettingsModal({ assignmentId, currentConfig, sourceType, onClose, onSaved }: Props) {
  const { showSuccessToast } = useToast();
  const [commits,        setCommits]        = useState(currentConfig.weights.commits);
  const [lines,          setLines]          = useState(currentConfig.weights.lines);
  const [activeDays,     setActiveDays]     = useState(currentConfig.weights.activeDays);
  const [freeRider,      setFreeRider]      = useState(currentConfig.thresholds.freeRider);
  const [overload,       setOverload]       = useState(currentConfig.thresholds.overload);
  const [deadlineDriven, setDeadlineDriven] = useState(currentConfig.thresholds.deadlineDriven);
  const [wGitHub,        setWGitHub]        = useState(currentConfig.blend?.wGitHub ?? DEFAULTS.blend!.wGitHub);
  const [wDocs,          setWDocs]          = useState(currentConfig.blend?.wDocs ?? DEFAULTS.blend!.wDocs);

  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const isCombined = sourceType === "COMBINED";

  const weightSum = Math.round((commits + lines + activeDays) * 1000) / 1000;
  const sumOk     = Math.abs(weightSum - 1.0) <= 0.001;

  const blendSum   = Math.round((wGitHub + wDocs) * 1000) / 1000;
  const blendSumOk = Math.abs(blendSum - 1.0) <= 0.001;

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // While the reset confirmation is open, Esc closes only that.
      if (e.key === "Escape" && !confirmingReset) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, confirmingReset]);

  function balanceBase() {
    const [c, l, a] = balanceWeights([commits, lines, activeDays]);
    setCommits(c!); setLines(l!); setActiveDays(a!);
  }

  function balanceBlend() {
    const [g, d] = balanceWeights([wGitHub, wDocs]);
    setWGitHub(g!); setWDocs(d!);
  }

  function resetToDefaults() {
    setCommits(DEFAULTS.weights.commits);
    setLines(DEFAULTS.weights.lines);
    setActiveDays(DEFAULTS.weights.activeDays);
    setFreeRider(DEFAULTS.thresholds.freeRider);
    setOverload(DEFAULTS.thresholds.overload);
    setDeadlineDriven(DEFAULTS.thresholds.deadlineDriven);
    setWGitHub(DEFAULTS.blend!.wGitHub);
    setWDocs(DEFAULTS.blend!.wDocs);
    setSaveError(null);
  }

  async function handleSave() {
    if (!sumOk || (isCombined && !blendSumOk)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/scoring-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weights:    { commits, lines, activeDays },
          thresholds: { freeRider, overload, deadlineDriven },
          blend:      { wGitHub, wDocs },
        }),
      });
      const data = (await res.json()) as { config?: ProjectScoringConfig; error?: string };
      if (!res.ok) {
        setSaveError(data.error ?? `Server error ${res.status}`);
        return;
      }
      onSaved(data.config!);
      showSuccessToast("Scoring settings saved.");
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
            <p className="text-xs font-medium text-slate-600 mt-1">
              Applies to all groups in this project. Re-analyze groups to apply new settings.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-600 hover:text-slate-600 transition-colors text-xl leading-none ml-4"
          >
            &times;
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">

          {/* ── Contribution Weights ─────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              <span className="inline-flex items-center gap-1">
                Contribution Weights
                <InfoTip label="About contribution weights" helpHref={helpLink("shares")}>{SETTINGS_TIPS.weights}</InfoTip>
              </span>
            </h3>

            <div className="space-y-4">
              <WeightRow
                label="Commits"
                description={SETTINGS_TIPS.commits}
                value={commits}
                onChange={setCommits}
              />
              <WeightRow
                label="Lines added"
                description={SETTINGS_TIPS.lines}
                value={lines}
                onChange={setLines}
              />
              <WeightRow
                label="Active days"
                description={SETTINGS_TIPS.activeDays}
                value={activeDays}
                onChange={setActiveDays}
              />
            </div>

            {/* Live total; Save stays disabled until the weights add up to 1.00 */}
            <SumRow name="Weights" sum={weightSum} ok={sumOk} onBalance={balanceBase} />

          </section>

          {/* ── Source Blend (COMBINED projects only) ───────────────────────────── */}
          {isCombined && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                <span className="inline-flex items-center gap-1">
                  Source Blend
                  <InfoTip label="About the source blend" helpHref={helpLink("combined")}>{SETTINGS_TIPS.blend}</InfoTip>
                </span>
              </h3>

              <div className="space-y-4">
                <WeightRow
                  label="GitHub weight"
                  description={SETTINGS_TIPS.githubWeight}
                  value={wGitHub}
                  onChange={setWGitHub}
                />
                <WeightRow
                  label="Docs weight"
                  description={SETTINGS_TIPS.docsWeight}
                  value={wDocs}
                  onChange={setWDocs}
                />
              </div>

              <SumRow name="Blend" sum={blendSum} ok={blendSumOk} onBalance={balanceBlend} />
            </section>
          )}

          {/* ── Flag Thresholds ───────────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Flag Thresholds
            </h3>

            <div className="space-y-4">
              <ThresholdRow
                label="Free-rider threshold"
                description={SETTINGS_TIPS.freeRider}
                value={freeRider}
                onChange={setFreeRider}
                min={0.1}
                max={0.9}
                step={0.05}
        formatValue={(v) => `${pct(v)} of equal share`}
              />
              <ThresholdRow
                label="Overload threshold"
                description={SETTINGS_TIPS.overload}
                value={overload}
                onChange={setOverload}
                min={1.1}
                max={4.0}
                step={0.05}
                formatValue={(v) => `${v.toFixed(2)}× equal share`}
              />
              <ThresholdRow
                label="Deadline-driven threshold"
                description={SETTINGS_TIPS.deadlineDriven}
                value={deadlineDriven}
                onChange={setDeadlineDriven}
                min={0.3}
                max={0.95}
                step={0.05}
                formatValue={(v) => `>${pct(v)} of activity in last third`}
              />
            </div>
          </section>

          {/* ── Reset ────────────────────────────────────────────────────────── */}
          <div className="flex justify-end">
            <button type="button" onClick={() => setConfirmingReset(true)} className={BUTTON_SECONDARY_COMPACT}>
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
          <p className="text-xs text-slate-600 max-w-xs">
            Saving marks every group's report as outdated until you re-analyze.
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
              disabled={!sumOk || (isCombined && !blendSumOk) || saving}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </div>

      {confirmingReset && (
        <ConfirmDialog
          title="Reset to defaults?"
          confirmLabel="Reset to defaults"
          onCancel={() => setConfirmingReset(false)}
          onConfirm={() => { resetToDefaults(); setConfirmingReset(false); }}
        >
          Every weight and threshold on this screen goes back to its default value. Nothing is saved until you press Save settings.
        </ConfirmDialog>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

/** Live total of a group of weights: text plus icon, and a one-click Balance when it is not 1.00. */
function SumRow({ name, sum, ok, onBalance }: { name: string; sum: number; ok: boolean; onBalance: () => void }) {
  const diff = Math.round(Math.abs(1 - sum) * 100) / 100;
  return (
    <div
      role="status"
      className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm ${
        ok ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"
      }`}
    >
      <span className="font-semibold">
        {ok ? "✓ " : "✕ "}
        {name} total: <span className="tabular-nums">{sum.toFixed(2)}</span> of 1.00
      </span>
      {!ok && (
        <>
          <span>{sum < 1 ? `${diff.toFixed(2)} short. ` : `${diff.toFixed(2)} over. `}Save is off until the total is 1.00.</span>
          <button type="button" onClick={onBalance} className={`${BUTTON_SECONDARY_COMPACT} min-h-10`}>Balance</button>
        </>
      )}
    </div>
  );
}

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
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
          {label}
          <InfoTip label={`About ${label.toLowerCase()}`} helpHref={helpLink("shares")}>{description}</InfoTip>
        </span>
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
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
          {label}
          <InfoTip label={`About the ${label.toLowerCase()}`} helpHref={helpLink("flags")}>{description}</InfoTip>
        </span>
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
    </div>
  );
}
