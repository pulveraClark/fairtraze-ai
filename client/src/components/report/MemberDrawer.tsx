import type { ReactNode } from "react";
import type { AnyScoredMember, MemberRoleInfo, ScoringThresholds } from "@shared/types";
import { Drawer, StatusPill, BUTTON_SECONDARY } from "../ui";
import { RoleChips } from "./MemberContributionList";
import { describeFlagRule, type DeadlineBasis, type FlagSource } from "../../lib/flagRules";
import { docsStatsOf, formatPct, githubStatsOf, isCombinedMember, roleInfoOf } from "../../lib/memberView";

type Outcome = "RESOLVED" | "DISMISSED";

interface Props {
  member: AnyScoredMember | null;
  onClose: () => void;
  restoreFocusTo?: HTMLElement | null;
  source: FlagSource;
  /** Thresholds that produced the stored report (scoringConfig), or null if the report has none. */
  thresholds: ScoringThresholds | null;
  deadlineBasis: DeadlineBasis | null;
  memberCount: number;
  memberRoles?: MemberRoleInfo[];
  disputed?: boolean;
  flagOutcomes?: Map<string, Outcome>;
  onOpenDisputes?: () => void;
}

export function NotAvailable({ children }: { children?: ReactNode }) {
  return <p className="text-base leading-normal text-slate-700">Not available{children ? ` — ${children}` : ""}</p>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 py-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-base font-semibold text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

function Stats({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-base leading-normal">
      {rows.map(([k, v]) => (
        <div key={k} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-slate-700">{k}</dt>
          <dd className="text-right font-semibold tabular-nums text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const n = (v: number) => v.toLocaleString();

export function MemberDrawer({
  member, onClose, restoreFocusTo, source, thresholds, deadlineBasis, memberCount, memberRoles, disputed, flagOutcomes, onOpenDisputes,
}: Props) {
  const open = member !== null;
  if (!member) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;

  const info = roleInfoOf(member, memberRoles);
  const equalPct = memberCount > 0 ? 100 / memberCount : 0;
  const pct = member.contributionShare * 100;
  const diff = pct - equalPct;
  const gh = githubStatsOf(member);
  const docs = docsStatsOf(member);
  const combined = isCombinedMember(member) ? member : null;
  const importedChars = docs && docs.importNote ? docs.importedRetainedChars : 0;
  const notes = info?.mismatchNotes ?? [];
  const tasks = info?.taskSummary;
  // activeDays only exists at the top level of GitHub-only / Docs-only members; Combined members
  // carry it inside their per-source blocks below.
  const topActiveDays = !combined && "activeDays" in member ? member.activeDays : null;

  return (
    <Drawer open={open} onClose={onClose} title={member.studentName} restoreFocusTo={restoreFocusTo} subtitle={<RoleChips info={info} />}>
      <Section title="Contribution share">
        <p className="text-[1.75rem] font-bold leading-tight text-slate-900">{formatPct(member.contributionShare)}</p>
        <p className="mt-1 text-base leading-normal text-slate-800">
          {Math.abs(diff).toFixed(1)} percentage points {diff >= 0 ? "above" : "below"} the equal share ({equalPct.toFixed(1)}% each).
        </p>
        {combined && (
          <div className="mt-3">
            <Stats
              rows={[
                ["GitHub share", formatPct(combined.githubContributionShare)],
                ["Docs share", formatPct(combined.documentContributionShare)],
                ["Blend weights (GitHub / Docs)", `${Math.round(combined.wGitHub * 100)}% / ${Math.round(combined.wDocs * 100)}%`],
              ]}
            />
          </div>
        )}
      </Section>

      <Section title="Flags">
        {member.flags.length === 0 ? (
          <p className="text-base text-slate-800">No flags</p>
        ) : (
          <ul className="space-y-3">
            {member.flags.map((f) => {
              const rule = describeFlagRule(f, thresholds, source, deadlineBasis);
              const outcome = flagOutcomes?.get(f);
              return (
                <li key={f}>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill kind="flag" value={f} />
                    {outcome === "RESOLVED" && <StatusPill kind="status" tone="green" label="Reviewed: accepted" />}
                    {outcome === "DISMISSED" && <StatusPill kind="status" tone="neutral" label="Reviewed: upheld" />}
                  </div>
                  {rule && (
                    <p className="mt-1 text-sm leading-normal text-slate-700">
                      <span className="font-semibold">How this flag is defined: </span>{rule}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {disputed && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill kind="status" tone="violet" label="Open dispute" />
            {onOpenDisputes && <button type="button" onClick={onOpenDisputes} className={BUTTON_SECONDARY}>View disputes</button>}
          </div>
        )}
        {(notes.length > 0 || (tasks && tasks.total > 0)) && (
          <div className="mt-3 space-y-1 text-sm leading-normal text-slate-800">
            {notes.map((note) => <p key={note}><span className="font-semibold">Context: </span>{note}</p>)}
            {tasks && tasks.total > 0 && <p><span className="font-semibold">Tasks: </span>{tasks.completed} of {tasks.total} completed</p>}
          </div>
        )}
      </Section>

      <Section title="GitHub activity">
        {gh ? (
          <Stats
            rows={[
              ["Commits", n(gh.commits)],
              ["Lines added", n(gh.additions)],
              ["Lines deleted", n(gh.deletions)],
              ["Code lines added", n(gh.codeLinesAdded)],
              ["Comment lines added", n(gh.commentLinesAdded)],
              ["Active days", n(gh.activeDays)],
              ["Self-churn", formatPct(gh.selfChurnRatio)],
            ]}
          />
        ) : (
          <NotAvailable>{source === "document" ? "this assignment does not use GitHub." : "no GitHub data for this member in the stored report."}</NotAvailable>
        )}
      </Section>

      <Section title="FairTraze Docs activity">
        {docs ? (
          <>
            <Stats
              rows={[
                ["Editing sessions", n(docs.sessionCount)],
                ["Retained characters", n(docs.retainedChars)],
                ["Characters inserted", n(docs.totalInsertedChars)],
                ["Characters deleted", n(docs.totalDeletedChars)],
                ["Active days", n(docs.activeDays)],
                ["Self-churn", formatPct(docs.selfChurnRatio)],
              ]}
            />
            {(importedChars > 0 || docs.insertedImageCount > 0) && (
              <div className="mt-2 space-y-1 text-sm leading-normal text-slate-800">
                {importedChars > 0 && <p><span className="font-semibold">Import: </span>{n(importedChars)} characters imported from .docx (session credit includes an estimate).</p>}
                {docs.insertedImageCount > 0 && <p><span className="font-semibold">Images: </span>{docs.insertedImageCount} inserted (disclosed only, never scored).</p>}
              </div>
            )}
          </>
        ) : (
          <NotAvailable>{source === "github" ? "this assignment does not use FairTraze Docs." : "no Docs data for this member in the stored report."}</NotAvailable>
        )}
      </Section>

      <Section title="Activity over time">
        <NotAvailable>the stored report keeps totals, not individual dates.</NotAvailable>
        <div className="mt-3">
          <Stats
            rows={[
              ["Share of activity in the final third", formatPct(member.lastPhaseRatio)],
              ...(topActiveDays !== null ? ([["Active days", n(topActiveDays)]] as Array<[string, ReactNode]>) : []),
            ]}
          />
        </div>
      </Section>
    </Drawer>
  );
}
