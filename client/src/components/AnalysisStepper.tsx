import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AnalyzeProgress } from "../lib/analyzeStream";
import { INITIAL_PROGRESS } from "../lib/analyzeStream";
import { usePrefersReducedMotion } from "../lib/usePrefersReducedMotion";

type SourceType = string | null;
type Status = "waiting" | "active" | "complete" | "pending";

// Every row below is driven by events the server actually emitted (see
// server/src/routes/analyze.ts) — there are no timers. Only raw collection counts are shown
// while the analysis runs; scores, flags and team health never appear in this panel.

const GITHUB_DESC = "Fetching per-contributor commit history from GitHub";
const DOCS_DESC   = "Fetching per-contributor edit history from FairTraze Docs";

// Tweens a displayed count toward its latest value. Under reduced motion it jumps straight there.
function useAnimatedNumber(target: number, reduced: boolean): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    if (reduced || shownRef.current === target) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const from = shownRef.current;
    const start = performance.now();
    const duration = 450;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const value = Math.round(from + (target - from) * t);
      shownRef.current = value;
      setShown(value);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);

  return shown;
}

function Chip({ label, value, reduced }: { label: string; value: number; reduced: boolean }) {
  const shown = useAnimatedNumber(value, reduced);
  return (
    <span className="inline-flex items-baseline gap-1 rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5 text-xs">
      <span className="font-semibold tabular-nums text-slate-700">{shown.toLocaleString()}</span>
      <span className="text-slate-500">{label}</span>
    </span>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "complete") {
    return (
      <span className="h-5 w-5 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-600 text-xs">
        ✓
      </span>
    );
  }
  if (status === "active") {
    return <span className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin motion-reduce:animate-none" />;
  }
  if (status === "waiting") {
    return <span className="h-5 w-5 rounded-full bg-white border-2 border-dashed border-slate-300" />;
  }
  return <span className="h-5 w-5 rounded-full bg-slate-100 border border-slate-200" />;
}

function titleClass(status: Status): string {
  return status === "complete" ? "text-emerald-700" : status === "active" ? "text-indigo-700" : "text-slate-400";
}

interface SourceCardProps {
  title: string;
  desc: string;
  status: Status;
  chips: ReactNode;
}

function SourceCard({ title, desc, status, chips }: SourceCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 min-w-0">
      <div className="flex items-center gap-2">
        <StatusIcon status={status} />
        <p className={`text-sm font-semibold leading-tight ${titleClass(status)}`}>{title}</p>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{desc}</p>
      <div className="mt-2 flex flex-wrap gap-1.5 min-h-[1.5rem]">
        {status === "waiting" ? <span className="text-xs text-slate-400">Waiting…</span> : chips}
      </div>
    </div>
  );
}

interface Props {
  progress?: AnalyzeProgress;
  done: boolean;            // true once the analyze call has returned its final result
  loadingReport?: boolean;  // true while the finished report is being re-read afterwards
  sourceType?: SourceType;
}

export function AnalysisStepper({ progress = INITIAL_PROGRESS, done, loadingReport = false, sourceType = null }: Props) {
  const reduced = usePrefersReducedMotion();
  const showGithub = sourceType !== "EDITOR";
  const showDocs   = sourceType === "EDITOR" || sourceType === "COMBINED";
  const stage = done ? "done" : progress.stage;
  const collected = stage !== "collecting";

  const githubStatus: Status = collected ? "complete" : progress.github ? "active" : "waiting";
  const docsStatus: Status    = collected || progress.docs ? "complete" : "waiting";
  const computeStatus: Status = stage === "compute" ? "active" : stage === "save" || stage === "done" ? "complete" : "pending";
  const saveStatus: Status    = stage === "save" ? "active" : stage === "done" ? "complete" : "pending";
  const readyStatus: Status   = stage === "done" ? "complete" : "pending";

  const g = progress.github;
  const d = progress.docs;
  const sources = (
    <div className={`grid gap-3 ${showGithub && showDocs ? "sm:grid-cols-2" : ""}`}>
      {showGithub && (
        <SourceCard
          title="GitHub"
          desc={GITHUB_DESC}
          status={githubStatus}
          chips={g && (
            <>
              <Chip label="contributors" value={g.contributors} reduced={reduced} />
              <Chip label="commits" value={g.commits} reduced={reduced} />
              <Chip label="files" value={g.files} reduced={reduced} />
            </>
          )}
        />
      )}
      {showDocs && (
        <SourceCard
          title="FairTraze Docs"
          desc={DOCS_DESC}
          status={docsStatus}
          chips={d && (
            <>
              <Chip label="sessions" value={d.sessions} reduced={reduced} />
              <Chip label="characters" value={d.characters} reduced={reduced} />
            </>
          )}
        />
      )}
    </div>
  );

  const steps: Array<{ key: string; title: string; desc?: string; status: Status; body?: ReactNode }> = [
    { key: "collect", title: "Data collection", status: collected ? "complete" : "active", body: sources },
    { key: "compute", title: "Compute scores", desc: "Scores computed by formula", status: computeStatus },
    { key: "save", title: "Save report", desc: "Persisting the computed report", status: saveStatus },
    { key: "ready", title: "Ready", desc: "AI explanation available on demand", status: readyStatus },
  ];
  const current = steps.find((s) => s.status === "active") ?? steps[steps.length - 1];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-5">
        Analysis in progress
      </p>
      <p role="status" className="sr-only">{done ? "Analysis complete" : `Current step: ${current.title}`}</p>
      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li key={step.key} className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 flex flex-col items-center">
              {/* The collection step shows per-source icons inside its cards instead. */}
              {step.key === "collect" ? (
                <span className="h-5 w-5 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-500">
                  {i + 1}
                </span>
              ) : step.status === "pending" ? (
                <span className="h-5 w-5 rounded-full bg-slate-100 border border-slate-200" />
              ) : (
                <StatusIcon status={step.status} />
              )}
              {i < steps.length - 1 && (
                <span
                  className={`w-px flex-1 mt-1 mb-[-12px] h-4 transition-colors motion-reduce:transition-none ${
                    step.status === "complete" ? "bg-emerald-200" : "bg-slate-100"
                  }`}
                />
              )}
            </div>
            <div className="pb-1 min-w-0 flex-1">
              <p className={`text-sm font-semibold leading-tight ${titleClass(step.key === "collect" ? (collected ? "complete" : "active") : step.status)}`}>
                {step.title}
              </p>
              {step.desc && (
                <p className={`text-xs mt-0.5 ${step.status === "pending" ? "text-slate-300" : "text-slate-500"}`}>{step.desc}</p>
              )}
              {step.body && <div className="mt-2">{step.body}</div>}
            </div>
          </li>
        ))}
      </ol>
      {loadingReport && (
        <div className="mt-5 flex items-center gap-2 text-xs text-slate-500">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin motion-reduce:animate-none" />
          Loading report…
        </div>
      )}
    </div>
  );
}
