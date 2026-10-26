import type { AnyScoredMember, MemberRoleInfo } from "@shared/types";
import { ListRow, StatusPill, CARD } from "../ui";
import { BUTTON_SECONDARY } from "../ui/styles";
import { PILL_TONES } from "../ui/StatusPill";
import type { AiReportGenerator } from "../../hooks/useGenerateAiReport";
import { formatPct, roleInfoOf, ROLE_LABEL } from "../../lib/memberView";
import { Avatar } from "../Avatar";
import { InfoTip } from "../ui/InfoTip";
import { TIPS, helpLink } from "../../lib/helpText";
import { AI_BUTTON_NOTE, WORK_SUMMARY_CHIP_TEXT, aiButtonLabel, type WorkSummaryState } from "../../lib/aiReview";

type Outcome = "RESOLVED" | "DISMISSED";

interface Props {
  members: AnyScoredMember[];
  memberRoles?: MemberRoleInfo[];
  disputedMembers?: Set<string>;
  resolvedFlagOutcomes?: Map<string, Map<string, Outcome>>;
  onOpen: (member: AnyScoredMember, opener: HTMLElement) => void;
  /** Instructor only: where the AI work summaries stand. Omit (or null) to show no chip. A text chip, not a button. */
  aiSummaryState?: WorkSummaryState | null;
  /** The shared AI generate action. Pass it only for viewers who may generate; omit for no button. */
  generator?: AiReportGenerator;
  /** AI findings already exist (button reads Regenerate). */
  hasNarrative?: boolean;
}

/** Role chips: leader + functional roles, text only (context, never a score input). */
export function RoleChips({ info }: { info: MemberRoleInfo | undefined }) {
  if (!info) return null;
  const chips: Array<{ key: string; label: string; cls: string }> = [];
  if (info.isLeader) chips.push({ key: "leader", label: "Leader", cls: PILL_TONES.indigo.cls });
  for (const r of info.functionalRoles) {
    chips.push({ key: r, label: ROLE_LABEL[r] ?? r, cls: r === "DOCUMENTATION" ? PILL_TONES.sky.cls : PILL_TONES.neutral.cls });
  }
  if (chips.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c.key} className={`rounded-md border px-2 py-0.5 text-xs font-medium leading-normal ${c.cls}`}>{c.label}</span>
      ))}
    </span>
  );
}

export function MemberContributionList({ members, memberRoles, disputedMembers, resolvedFlagOutcomes, onOpen, aiSummaryState, generator, hasNarrative = false }: Props) {
  const n = members.length;
  const equalPct = n > 0 ? 100 / n : 0;
  // One shared bar scale so rows are comparable; always wide enough to show the equal-share marker.
  const maxPct = Math.max(equalPct * 2, ...members.map((m) => m.contributionShare * 100));
  const axisMax = Math.min(100, Math.ceil(maxPct / 5) * 5) || 100;

  return (
    <section aria-labelledby="member-contributions-title" className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-slate-200 px-4 py-4">
        <div className="min-w-0">
          <h2 id="member-contributions-title" className="text-lg font-semibold text-slate-900">Member contributions</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm leading-normal text-slate-700">
            Select a member for details.
            <InfoTip label="About the equal-share marker" helpHref={helpLink("shares")}>{TIPS.equalShareList(equalPct)}</InfoTip>
          </p>
          {aiSummaryState && (
            <p className="mt-2 inline-flex max-w-full flex-wrap items-center rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-medium leading-normal text-slate-800">
              {WORK_SUMMARY_CHIP_TEXT[aiSummaryState]}
            </p>
          )}
        </div>
        {generator && (
          <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
            <button
              type="button"
              onClick={() => generator.generate(hasNarrative)}
              disabled={generator.generating}
              className={`${BUTTON_SECONDARY} min-h-10`}
            >
              {aiButtonLabel(generator.generating, hasNarrative)}
            </button>
            <p className="text-xs leading-normal text-slate-700 sm:text-right">{AI_BUTTON_NOTE}</p>
          </div>
        )}
      </div>
      <ul className="divide-y divide-slate-200">
        {members.map((m) => {
          const info = roleInfoOf(m, memberRoles);
          const pct = m.contributionShare * 100;
          const diff = pct - equalPct;
          const disputed = disputedMembers?.has(m.studentName);
          const outcomes = resolvedFlagOutcomes?.get(m.studentName);
          return (
            <li key={m.studentName} data-member-row={m.studentName}>
              <ListRow
                opensDialog
                onClick={(el) => onOpen(m, el)}
                ariaLabel={`${m.studentName}, ${formatPct(m.contributionShare)} share, ${m.flags.length ? m.flags.join(", ") : "no flags"}. Open details`}
              >
                <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.4fr)_4rem_12rem]">
                  <Avatar
                    userId={info?.userId}
                    name={m.studentName}
                    avatarUpdatedAt={info?.avatarUpdatedAt}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-900"
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="break-words text-sm font-semibold leading-snug text-slate-900">{m.studentName}</span>
                    <RoleChips info={info} />
                  </span>
                  <span className="col-span-2 flex items-center gap-3 sm:col-span-1">
                    <span aria-hidden="true" className="relative h-3 min-w-0 flex-1 rounded-full bg-slate-200">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-indigo-700" style={{ width: `${Math.min(100, (pct / axisMax) * 100)}%` }} />
                      <span className="absolute -inset-y-1 w-0.5 bg-slate-900" style={{ left: `${(equalPct / axisMax) * 100}%` }} />
                    </span>
                    <span className="sr-only">
                      {Math.abs(diff).toFixed(1)} percentage points {diff >= 0 ? "above" : "below"} the equal share.
                    </span>
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums text-slate-900">{formatPct(m.contributionShare)}</span>
                  <span className="col-span-2 flex flex-wrap items-center gap-1.5 sm:col-span-1 sm:justify-end">
                    {m.flags.length === 0 ? (
                      <span className="text-sm text-slate-700">No flags</span>
                    ) : (
                      m.flags.map((f) => (
                        <span key={f} className="inline-flex flex-wrap items-center gap-1">
                          <StatusPill kind="flag" value={f} />
                          {outcomes?.get(f) === "RESOLVED" && <StatusPill kind="status" tone="green" label="Reviewed: accepted" />}
                          {outcomes?.get(f) === "DISMISSED" && <StatusPill kind="status" tone="neutral" label="Reviewed: upheld" />}
                        </span>
                      ))
                    )}
                    {disputed && <StatusPill kind="status" tone="violet" label="Open dispute" />}
                  </span>
                </span>
              </ListRow>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
