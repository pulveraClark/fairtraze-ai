import { useState } from "react";
import type { ProjectScoringConfig } from "@shared/types";
import { useToast } from "./Toast";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Modal } from "./ui/Modal";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT } from "./ui/styles";
import { balanceWeights } from "../lib/balanceWeights";
import { InfoTip } from "./ui/InfoTip";
import { SETTINGS_TIPS, helpLink } from "../lib/helpText";
import { DOCUMENT_DEFAULT_WEIGHTS, DEFAULT_BLEND_WEIGHTS } from "@shared/weights";

// The Docs weights and the blend are read from shared/, never retyped here.
const DEFAULTS = {
  weights:     { commits: 0.4, lines: 0.4, activeDays: 0.2 },
  thresholds:  { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 },
  blend:       DEFAULT_BLEND_WEIGHTS,
  docsWeights: DOCUMENT_DEFAULT_WEIGHTS,
};

interface Props {
  /** The project (Assignment) whose settings are edited; they apply to every group in it. */
  assignmentId: number;
  currentConfig: ProjectScoringConfig;
  // GITHUB shows the code weights, EDITOR the writing (Docs) weights, COMBINED both plus the Source blend.
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
  const [wGitHub,        setWGitHub]        = useState(currentConfig.blend?.wGitHub ?? DEFAULTS.blend.wGitHub);
  const [wDocs,          setWDocs]          = useState(currentConfig.blend?.wDocs ?? DEFAULTS.blend.wDocs);
  const [docsText,       setDocsText]       = useState(currentConfig.docsWeights?.retainedText ?? DEFAULTS.docsWeights.retainedText);
  const [docsSessions,   setDocsSessions]   = useState(currentConfig.docsWeights?.sessions ?? DEFAULTS.docsWeights.sessions);
  const [docsDays,       setDocsDays]       = useState(currentConfig.docsWeights?.activeDays ?? DEFAULTS.docsWeights.activeDays);

  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const isCombined = sourceType === "COMBINED";
  const showCode   = sourceType !== "EDITOR";                       // GITHUB, COMBINED (or unknown)
  const showDocs   = sourceType === "EDITOR" || isCombined;

  const weightSum = Math.round((commits + lines + activeDays) * 1000) / 1000;
  const sumOk     = Math.abs(weightSum - 1.0) <= 0.001;

  const blendSum   = Math.round((wGitHub + wDocs) * 1000) / 1000;
  const blendSumOk = Math.abs(blendSum - 1.0) <= 0.001;

  const docsSum   = Math.round((docsText + docsSessions + docsDays) * 1000) / 1000;
  const docsSumOk = Math.abs(docsSum - 1.0) <= 0.001;

  // Save stays off for any visible group that does not add up to 1.00 (the server rejects the same).
  const canSave = (!showCode || sumOk) && (!showDocs || docsSumOk) && (!isCombined || blendSumOk);

  const near = (a: number, b: number) => Math.abs(a - b) < 0.0005;
  const codeChanged  = !near(commits, DEFAULTS.weights.commits) || !near(lines, DEFAULTS.weights.lines) || !near(activeDays, DEFAULTS.weights.activeDays);
  const docsChanged  = !near(docsText, DEFAULTS.docsWeights.retainedText) || !near(docsSessions, DEFAULTS.docsWeights.sessions) || !near(docsDays, DEFAULTS.docsWeights.activeDays);
  const blendChanged = !near(wGitHub, DEFAULTS.blend.wGitHub) || !near(wDocs, DEFAULTS.blend.wDocs);

  function balanceBase() {
    const [c, l, a] = balanceWeights([commits, lines, activeDays]);
    setCommits(c!); setLines(l!); setActiveDays(a!);
  }

  function balanceDocs() {
    const [t, ss, d] = balanceWeights([docsText, docsSessions, docsDays]);
    setDocsText(t!); setDocsSessions(ss!); setDocsDays(d!);
  }

  function resetCode() {
    setCommits(DEFAULTS.weights.commits); setLines(DEFAULTS.weights.lines); setActiveDays(DEFAULTS.weights.activeDays);
  }
  function resetDocs() {
    setDocsText(DEFAULTS.docsWeights.retainedText); setDocsSessions(DEFAULTS.docsWeights.sessions); setDocsDays(DEFAULTS.docsWeights.activeDays);
  }
  function resetBlend() {
    setWGitHub(DEFAULTS.blend.wGitHub); setWDocs(DEFAULTS.blend.wDocs);
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
    resetBlend();
    resetDocs();
    setSaveError(null);
  }

  async function handleSave() {
    if (!canSave) return;
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
          docsWeights: { retainedText: docsText, sessions: docsSessions, activeDays: docsDays },
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
    // While the reset confirmation is open, Esc / the scrim close only that, not this dialog.
    <Modal
      open
      onClose={() => { if (!confirmingReset) onClose(); }}
      title="Scoring settings"
      size="md"
      heading={
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Scoring settings</h2>
          <p className="text-xs font-medium text-slate-600 mt-1">
            Applies to all groups in this project. Re-analyze groups to apply new settings.
          </p>
          <p className="text-xs text-slate-600 mt-1">{SETTINGS_TIPS.provenance}</p>
        </div>
      }
    >
      <div>
        <div className="space-y-6">

          {/* ── Code weights (GitHub) ─────────────────────────────────────────── */}
          {showCode && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                <span className="inline-flex items-center gap-1">
                  Code weights (GitHub)
                  <InfoTip label="About code weights" helpHref={helpLink("shares")}>{SETTINGS_TIPS.weights}</InfoTip>
                </span>
              </h3>

              <div className="space-y-4">
                <WeightRow label="Commits" description={SETTINGS_TIPS.commits} value={commits} onChange={setCommits} defaultValue={DEFAULTS.weights.commits} />
                <WeightRow label="Lines added" description={SETTINGS_TIPS.lines} value={lines} onChange={setLines} defaultValue={DEFAULTS.weights.lines} />
                <WeightRow
                  label="Active days"
                  ariaName="Code active days"
                  tipLabel="About code active days"
                  description={SETTINGS_TIPS.activeDays}
                  value={activeDays}
                  onChange={setActiveDays}
                  defaultValue={DEFAULTS.weights.activeDays}
                />
              </div>

              {/* Live total; Save stays disabled until the weights add up to 1.00 */}
              <SumRow name="Code" sum={weightSum} ok={sumOk} onBalance={balanceBase} changed={codeChanged} onReset={resetCode} />
            </section>
          )}

          {/* ── Writing weights (Docs): EDITOR and COMBINED projects ─────────────── */}
          {showDocs && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                <span className="inline-flex items-center gap-1">
                  Writing weights (Docs)
                  <InfoTip label="About writing weights" helpHref={helpLink("shares-docs")}>{SETTINGS_TIPS.docsWeights}</InfoTip>
                </span>
              </h3>

              <div className="space-y-4">
                <WeightRow label="Retained text" description={SETTINGS_TIPS.docsRetainedText} value={docsText} onChange={setDocsText} defaultValue={DEFAULTS.docsWeights.retainedText} helpAnchor="shares-docs" />
                <WeightRow label="Writing sessions" description={SETTINGS_TIPS.docsSessions} value={docsSessions} onChange={setDocsSessions} defaultValue={DEFAULTS.docsWeights.sessions} helpAnchor="shares-docs" />
                <WeightRow
                  label="Active days"
                  ariaName="Writing active days"
                  tipLabel="About writing active days"
                  description={SETTINGS_TIPS.docsActiveDays}
                  value={docsDays}
                  onChange={setDocsDays}
                  defaultValue={DEFAULTS.docsWeights.activeDays}
                  helpAnchor="shares-docs"
                />
              </div>

              <SumRow name="Docs" sum={docsSum} ok={docsSumOk} onBalance={balanceDocs} changed={docsChanged} onReset={resetDocs} />
            </section>
          )}

          {/* ── Source Blend (COMBINED projects only) ───────────────────────────── */}
          {isCombined && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                <span className="inline-flex items-center gap-1">
                  Source blend
                  <InfoTip label="About the source blend" helpHref={helpLink("combined")}>{SETTINGS_TIPS.blend}</InfoTip>
                </span>
              </h3>

              <div className="space-y-4">
                <WeightRow
                  label="GitHub weight"
                  description={SETTINGS_TIPS.githubWeight}
                  value={wGitHub}
                  onChange={setWGitHub}
                  defaultValue={DEFAULTS.blend.wGitHub}
                  helpAnchor="combined"
                />
                <WeightRow
                  label="Docs weight"
                  description={SETTINGS_TIPS.docsWeight}
                  value={wDocs}
                  onChange={setWDocs}
                  defaultValue={DEFAULTS.blend.wDocs}
                  helpAnchor="combined"
                />
              </div>

              <SumRow name="Blend" sum={blendSum} ok={blendSumOk} onBalance={balanceBlend} changed={blendChanged} onReset={resetBlend} />
            </section>
          )}

          {/* ── Flag Thresholds ───────────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Flag thresholds
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
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-600 max-w-xs">
            Saving marks every group's report as outdated until you re-analyze.
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className={BUTTON_SECONDARY_COMPACT}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className={BUTTON_PRIMARY_COMPACT}
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
    </Modal>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

/**
 * Live total of a group of weights: text plus icon, what to fix when it is not 1.00, a one-click
 * Balance, and a Reset for just this group once it differs from its default.
 */
function SumRow({ name, sum, ok, onBalance, changed, onReset }: {
  name: string; sum: number; ok: boolean; onBalance: () => void; changed: boolean; onReset: () => void;
}) {
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
          <span>
            {name} weights add up to {sum.toFixed(2)}. They must add up to 1.00 ({diff.toFixed(2)} {sum < 1 ? "short" : "over"}). Save is off until then.
          </span>
          <button type="button" onClick={onBalance} className={`${BUTTON_SECONDARY_COMPACT} min-h-10`}>Balance</button>
        </>
      )}
      {changed && (
        <button
          type="button"
          onClick={onReset}
          aria-label={`Reset ${name.toLowerCase()} weights to default`}
          className={`${BUTTON_SECONDARY_COMPACT} min-h-10 sm:ml-auto`}
        >
          Reset to default
        </button>
      )}
    </div>
  );
}

interface WeightRowProps {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  /** The default for this weight, shown as "Default 0.37" so nobody has to remember it. */
  defaultValue: number;
  /** Accessible name when the visible label repeats in another group (e.g. "Active days"). */
  ariaName?: string;
  tipLabel?: string;
  helpAnchor?: "shares" | "shares-docs" | "combined";
}

function WeightRow({ label, description, value, onChange, defaultValue, ariaName, tipLabel, helpAnchor = "shares" }: WeightRowProps) {
  const display = Math.round(value * 100) / 100;
  const isDefault = Math.abs(value - defaultValue) < 0.0005;
  const name = ariaName ?? label;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 mb-1">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
          {label}
          <InfoTip label={tipLabel ?? `About ${label.toLowerCase()}`} helpHref={helpLink(helpAnchor)}>{description}</InfoTip>
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 tabular-nums">
            {isDefault ? `Default ${defaultValue.toFixed(2)}` : `Changed · default ${defaultValue.toFixed(2)}`}
          </span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={display}
            aria-label={`${name} weight`}
            onChange={(e) => onChange(Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)))}
            className="w-16 min-h-8 text-right text-xs font-mono border border-slate-200 rounded px-1.5 focus:outline-none focus:border-indigo-400"
          />
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        aria-label={`${name} weight slider`}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-6 accent-indigo-600 cursor-pointer"
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
        className="w-full h-6 accent-indigo-600 cursor-pointer"
      />
    </div>
  );
}
