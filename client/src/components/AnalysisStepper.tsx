import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AnalyzeProgress, DocsMember, GithubMember } from "../lib/analyzeStream";
import { INITIAL_PROGRESS, formatSeconds, stageDurations } from "../lib/analyzeStream";
import { usePrefersReducedMotion } from "../lib/usePrefersReducedMotion";

type SourceType = string | null;
type Status = "waiting" | "active" | "complete";

// Everything below is driven by events the server actually emitted (see
// server/src/routes/analyze.ts). The only timers are presentation staggers over events that
// already arrived (and they are skipped under reduced motion and once the analysis is done).
// Raw counts, display names and per-day counts only — scores, flags and team health never
// appear in this panel.

const FORMULA_LABELS: Array<{ text: string; show: (s: { github: boolean; docs: boolean }) => boolean }> = [
  { text: "Weighting commits by file type",        show: (s) => s.github },
  { text: "Measuring retained document text",      show: (s) => s.docs },
  { text: "Blending GitHub and Docs",              show: (s) => s.github && s.docs },
  { text: "Comparing each member to the equal share", show: () => true },
  { text: "Calculating the Gini coefficient",      show: () => true },
];

const MEMBER_STAGGER_MS = 180;   // per-member pop-in delay, shrunk so a burst never exceeds ~1s
const LABEL_STAGGER_MS  = 170;
const MAX_STAGGER_MS    = 1000;

// Tweens a displayed count toward its latest value. When `instant` it jumps straight there.
function useAnimatedNumber(target: number, instant: boolean, initial: number = target): number {
  const [shown, setShown] = useState(instant ? target : initial);
  const shownRef = useRef(instant ? target : initial);

  useEffect(() => {
    if (instant || shownRef.current === target) {
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
  }, [target, instant]);

  return shown;
}

// How many of `total` items to show. Items that are already there appear one by one with a short
// stagger whose total is capped; `immediate` reveals everything at once.
function useRevealCount(total: number, active: boolean, immediate: boolean, stepMs: number): number {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!active || immediate || shown >= total) return;
    const pending = total - shown;
    const timer = setTimeout(
      () => setShown((s) => Math.min(total, s + 1)),
      Math.max(20, Math.min(stepMs, Math.floor(MAX_STAGGER_MS / pending)))
    );
    return () => clearTimeout(timer);
  }, [active, immediate, total, shown, stepMs]);

  if (!active) return 0;
  return immediate ? total : Math.min(shown, total);
}

// Live elapsed seconds while the analysis runs; frozen at the done timestamp afterwards.
function useElapsedSeconds(startedAt: number | undefined, doneAt: number | undefined, running: boolean): number | undefined {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running || startedAt === undefined) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [running, startedAt]);
  if (startedAt === undefined) return undefined;
  return Math.max(0, ((doneAt ?? now) - startedAt) / 1000);
}

function Chip({ label, value, instant }: { label: string; value: number; instant: boolean }) {
  const shown = useAnimatedNumber(value, instant);
  return (
    <span className="inline-flex items-baseline gap-1 rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5 text-xs">
      <span className="font-semibold tabular-nums text-slate-700">{shown.toLocaleString()}</span>
      <span className="text-slate-600">{label}</span>
    </span>
  );
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span className={`${className} rounded-full border-2 border-indigo-500 border-t-transparent animate-spin motion-reduce:animate-none`} />;
}

function CheckBadge({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`${className} shrink-0 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 text-xs`}>
      ✓
    </span>
  );
}

// ── Data-flow header ──────────────────────────────────────────────────────────

type LineState = "idle" | "flowing" | "done";

function FlowLine({ state, reduced }: { state: LineState; reduced: boolean }) {
  const colour = state === "done" ? "bg-emerald-500" : state === "flowing" ? "bg-indigo-300" : "bg-slate-200";
  return (
    <span
      aria-hidden="true"
      data-state={state}
      className={`relative block overflow-hidden rounded-full transition-colors motion-reduce:transition-none ${colour}
        h-5 w-0.5 sm:h-0.5 sm:w-auto sm:flex-1 sm:min-w-6`}
    >
      {state === "flowing" && !reduced && (
        <>
          <span className="ft-flow-dot ft-flow-dot-x hidden sm:block" />
          <span className="ft-flow-dot ft-flow-dot-x hidden sm:block" style={{ animationDelay: "0.45s" }} />
          <span className="ft-flow-dot ft-flow-dot-y sm:hidden" />
        </>
      )}
    </span>
  );
}

function FlowNode({ title, sub, status, statusText, icon }: {
  title: string; sub?: string; status: Status; statusText: string; icon: ReactNode;
}) {
  const tone =
    status === "complete" ? "border-emerald-200 bg-emerald-50"
    : status === "active" ? "border-indigo-200 bg-indigo-50"
    : "border-slate-200 bg-slate-50";
  return (
    <div className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg border px-3 py-2 text-center ${tone}`}>
      <span className="text-slate-600">{icon}</span>
      <p className="text-sm font-semibold leading-tight text-slate-800">{title}</p>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
      <p className="text-xs font-medium text-slate-700">{statusText}</p>
    </div>
  );
}

const GithubIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="9" r="2" />
    <path d="M6 8v8M18 11c0 4-6 3-12 5" />
  </svg>
);
const DocsIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" />
  </svg>
);
const EngineIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9h6M9 13h6M9 17h3" />
  </svg>
);
const ReportIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M5 20V10M12 20V4M19 20v-7" />
  </svg>
);

const sourceStatusText = (s: Status) => (s === "complete" ? "Done" : s === "active" ? "Collecting" : "Waiting");

// ── Per-source contributor cards ──────────────────────────────────────────────

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function MemberRow({ name, tone, value, children }: {
  name: string; tone: "github" | "docs"; value: number; children: (n: number) => ReactNode;
}) {
  return (
    <li className="flex min-h-9 items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          tone === "github" ? "bg-indigo-100 text-indigo-800" : "bg-emerald-100 text-emerald-800"
        }`}
      >
        {initialsOf(name)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{name}</span>
      <span className="shrink-0 text-xs text-slate-600 tabular-nums">{children(value)}</span>
    </li>
  );
}

function GithubMemberRow({ m, instant }: { m: GithubMember; instant: boolean }) {
  const n = useAnimatedNumber(m.commits, instant, 0);
  return (
    <MemberRow name={m.name} tone="github" value={n}>
      {(v) => <><span className="font-semibold text-slate-700">{v}</span> {plural(m.commits, "commit", "commits")}</>}
    </MemberRow>
  );
}

function DocsMemberRow({ m, instant }: { m: DocsMember; instant: boolean }) {
  const sessions = useAnimatedNumber(m.sessions, instant, 0);
  const chars = useAnimatedNumber(m.characters, instant, 0);
  return (
    <MemberRow name={m.name} tone="docs" value={sessions}>
      {(v) => (
        <>
          <span className="font-semibold text-slate-700">{v}</span> {plural(m.sessions, "session", "sessions")}
          {" · "}
          <span className="font-semibold text-slate-700">{chars.toLocaleString()}</span> chars
        </>
      )}
    </MemberRow>
  );
}

interface SourceCardProps {
  title: string;
  status: Status;
  doneIn?: number;
  chips: ReactNode;
  rows: ReactNode;
}

function SourceCard({ title, status, doneIn, chips, rows }: SourceCardProps) {
  return (
    <section aria-label={title} className="h-full rounded-xl border border-slate-200 p-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        {status === "complete" && doneIn !== undefined && (
          <span className="text-xs font-medium text-emerald-700">Done in {formatSeconds(doneIn)}</span>
        )}
        {status === "active" && <Spinner className="h-3.5 w-3.5" />}
      </div>
      {status === "waiting" ? (
        <p className="mt-3 text-xs text-slate-600">Waiting…</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div>
          <ul className="mt-2">{rows}</ul>
        </>
      )}
    </section>
  );
}

// ── Activity by day ───────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const parseDay = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function ActivityChart({ commits, sessions, showGithub, showDocs, collecting }: {
  commits: Record<string, number>;
  sessions: Record<string, number>;
  showGithub: boolean;
  showDocs: boolean;
  collecting: boolean;
}) {
  const keys = [...Object.keys(commits), ...Object.keys(sessions)].sort();
  const days: number[] = [];
  if (keys.length > 0) {
    for (let t = parseDay(keys[0]); t <= parseDay(keys[keys.length - 1]); t += DAY_MS) days.push(t);
  }
  const max = Math.max(1, ...days.map((t) => Math.max(commits[dayKey(t)] ?? 0, sessions[dayKey(t)] ?? 0)));
  const labelEvery = Math.max(1, Math.ceil(days.length / 7));

  return (
    <section aria-label="Activity by day" className="h-full rounded-xl border border-slate-200 p-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-800">Activity by day</h3>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          {showGithub && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />Commits</span>}
          {showDocs && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />Edit sessions</span>}
        </div>
      </div>
      {days.length === 0 ? (
        <p className="mt-3 text-xs text-slate-600">{collecting ? "Waiting for activity…" : "No dated activity found."}</p>
      ) : (
        <div
          role="img"
          aria-label={`Commits and edit sessions per day, ${dayLabel(days[0])} to ${dayLabel(days[days.length - 1])}`}
          className="mt-3"
        >
          <div className="flex h-28 items-end gap-px sm:gap-1">
            {days.map((t) => {
              const key = dayKey(t);
              const c = commits[key] ?? 0;
              const s = sessions[key] ?? 0;
              return (
                <div key={key} className="flex h-full min-w-0 flex-1 items-end justify-center gap-px" title={`${dayLabel(t)}: ${c} commits, ${s} edit sessions`}>
                  {showGithub && (
                    <span className="w-full max-w-3 rounded-t-sm bg-indigo-500 motion-safe:transition-[height] motion-safe:duration-300" style={{ height: c ? `${Math.max(4, (c / max) * 100)}%` : 0 }} />
                  )}
                  {showDocs && (
                    <span className="w-full max-w-3 rounded-t-sm bg-emerald-600 motion-safe:transition-[height] motion-safe:duration-300" style={{ height: s ? `${Math.max(4, (s / max) * 100)}%` : 0 }} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-px sm:gap-1 border-t border-slate-200 pt-1">
            {days.map((t, i) => (
              <span key={t} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-xs text-slate-600">
                {i % labelEvery === 0 ? dayLabel(t) : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface Props {
  progress?: AnalyzeProgress;
  done: boolean;            // true once the analyze call has returned its final result
  sourceType?: SourceType;
}

export function AnalysisStepper({ progress = INITIAL_PROGRESS, done, sourceType = null }: Props) {
  const reduced = usePrefersReducedMotion();
  const showGithub = sourceType !== "EDITOR";
  const showDocs   = sourceType === "EDITOR" || sourceType === "COMBINED";
  const stage = done ? "done" : progress.stage;
  const collected = stage !== "collecting";
  const computeStarted = stage === "compute" || stage === "save" || stage === "done";
  // Never delay the finished state: on done (or reduced motion) everything renders at once.
  const instant = reduced || done;

  const githubStatus: Status = collected ? "complete" : progress.github ? "active" : "waiting";
  const docsStatus: Status    = collected ? "complete" : progress.docs ? "active" : "waiting";
  const computeStatus: Status = stage === "compute" || stage === "save" ? "active" : stage === "done" ? "complete" : "waiting";
  const reportStatus: Status  = stage === "done" ? "complete" : stage === "save" ? "active" : "waiting";

  const lineFor = (s: Status): LineState => (s === "complete" ? "done" : s === "active" ? "flowing" : "idle");
  const engineLine: LineState = stage === "done" ? "done" : stage === "compute" || stage === "save" ? "flowing" : "idle";

  const durations = stageDurations(progress.times);
  const elapsed = useElapsedSeconds(progress.times.startedAt, progress.times.doneAt, !done);

  const visibleLabels = FORMULA_LABELS.filter((l) => l.show({ github: showGithub, docs: showDocs }));
  const labelCount = useRevealCount(visibleLabels.length, computeStarted, instant, LABEL_STAGGER_MS);
  const githubRows = useRevealCount(progress.githubMembers.length, true, instant, MEMBER_STAGGER_MS);
  const docsRows = useRevealCount(progress.docsMembers.length, true, instant, MEMBER_STAGGER_MS);

  const g = progress.github;
  const d = progress.docs;
  const currentStep =
    done ? "Analysis complete"
    : stage === "collecting" ? "Current step: Collecting data"
    : stage === "compute" ? "Current step: Calculating"
    : "Current step: Saving report";

  const timingParts: string[] = [];
  if (showDocs && durations.docs !== undefined && collected) timingParts.push(`Docs ${formatSeconds(durations.docs)}`);
  if (showGithub && durations.github !== undefined && collected) timingParts.push(`GitHub ${formatSeconds(durations.github)}`);
  if (durations.compute !== undefined) timingParts.push(`Compute ${formatSeconds(durations.compute)}`);
  if (durations.save !== undefined) timingParts.push(`Save ${formatSeconds(durations.save)}`);

  const sourceCount = (showGithub ? 1 : 0) + (showDocs ? 1 : 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <p role="status" className="sr-only">{currentStep}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {done ? <CheckBadge /> : <Spinner className="h-5 w-5" />}
          <h2 className="text-base font-semibold text-slate-800">
            {done
              ? `Analysis complete${durations.total !== undefined ? ` in ${formatSeconds(durations.total)}` : ""}`
              : "Analysis in progress"}
          </h2>
        </div>
        {elapsed !== undefined && (
          <p className="text-xs text-slate-600 tabular-nums">Elapsed {elapsed.toFixed(1)}s</p>
        )}
      </div>

      {/* Data flow */}
      <div className="mt-4 flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-0" aria-label="Data flow">
        <div className="flex flex-1 flex-col gap-2 min-w-0">
          {showGithub && (
            <div className="flex flex-col items-center sm:flex-row">
              <div className="w-full sm:w-36 sm:shrink-0">
                <FlowNode title="GitHub" status={githubStatus} statusText={sourceStatusText(githubStatus)} icon={GithubIcon} />
              </div>
              <FlowLine state={lineFor(githubStatus)} reduced={reduced} />
            </div>
          )}
          {showDocs && (
            <div className="flex flex-col items-center sm:flex-row">
              <div className="w-full sm:w-36 sm:shrink-0">
                <FlowNode title="FairTraze Docs" status={docsStatus} statusText={sourceStatusText(docsStatus)} icon={DocsIcon} />
              </div>
              <FlowLine state={lineFor(docsStatus)} reduced={reduced} />
            </div>
          )}
        </div>
        <div className="w-full sm:w-40 sm:shrink-0">
          <FlowNode
            title="Scoring engine"
            sub="Formula-based"
            status={computeStatus}
            statusText={computeStatus === "complete" ? "Done" : computeStatus === "active" ? "Computing" : "Waiting"}
            icon={EngineIcon}
          />
        </div>
        <div className="flex flex-1 flex-col items-center sm:flex-row min-w-0">
          <FlowLine state={engineLine} reduced={reduced} />
          <div className="w-full sm:w-28 sm:shrink-0">
            <FlowNode
              title="Report"
              status={reportStatus}
              statusText={reportStatus === "complete" ? "Saved" : reportStatus === "active" ? "Saving" : "Waiting"}
              icon={ReportIcon}
            />
          </div>
        </div>
      </div>

      {/* Per-source contributors */}
      <div className={`mt-4 grid items-stretch gap-4 ${sourceCount === 2 ? "sm:grid-cols-2" : ""}`}>
        {showGithub && (
          <SourceCard
            title="GitHub contributors"
            status={githubStatus}
            doneIn={durations.github}
            chips={g && (
              <>
                <Chip label="contributors" value={g.contributors} instant={instant} />
                <Chip label="commits" value={g.commits} instant={instant} />
                <Chip label="files" value={g.files} instant={instant} />
              </>
            )}
            rows={progress.githubMembers.slice(0, githubRows).map((m) => <GithubMemberRow key={m.name} m={m} instant={instant} />)}
          />
        )}
        {showDocs && (
          <SourceCard
            title="FairTraze Docs editors"
            status={docsStatus}
            doneIn={durations.docs}
            chips={d && (
              <>
                <Chip label="sessions" value={d.sessions} instant={instant} />
                <Chip label="characters" value={d.characters} instant={instant} />
              </>
            )}
            rows={progress.docsMembers.slice(0, docsRows).map((m) => <DocsMemberRow key={m.name} m={m} instant={instant} />)}
          />
        )}
      </div>

      {/* Activity by day + formula */}
      <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ActivityChart
          commits={progress.githubDays}
          sessions={progress.docsDays}
          showGithub={showGithub}
          showDocs={showDocs}
          collecting={!collected}
        />
        <section aria-label="What the formula is doing" className="h-full rounded-xl border border-slate-200 p-4 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-800">What the formula is doing</h3>
            {durations.compute !== undefined && (
              <span className="text-xs text-slate-600 tabular-nums">{formatSeconds(durations.compute)}</span>
            )}
          </div>
          {computeStarted ? (
            <ul className="mt-3 space-y-2" style={{ minHeight: `${visibleLabels.length * 1.75}rem` }}>
              {visibleLabels.slice(0, labelCount).map((l) => (
                <li key={l.text} className="flex items-center gap-2 text-sm text-slate-800">
                  <CheckBadge className="h-4 w-4" />
                  {l.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-600">Waiting for collection to finish…</p>
          )}
        </section>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600">
        <p className="tabular-nums">{timingParts.join(" · ")}</p>
        <p>Counts only while collecting. The report opens when the analysis is done.</p>
      </div>
    </div>
  );
}
