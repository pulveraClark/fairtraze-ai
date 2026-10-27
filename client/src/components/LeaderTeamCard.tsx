import { Avatar } from "./Avatar";
import type { Flag } from "@shared/types";
import { FlagTag } from "./FlagTag";
import { NoActivityPill } from "./NoActivityPill";
import { ShareBar } from "./report/DrawerParts";
import { taskCountLabel } from "../lib/tasks/countLabel";
import { studentFlagLabel } from "../lib/studentDisplay";
import { InfoTip } from "./ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";

/** Mirrors LeaderTeamMemberView in server/src/routes/join.ts. */
export interface LeaderTeamMember {
  userId: number;
  name: string;
  isLeader: boolean;
  functionalRoles: string[];
  hasAvatar: boolean;
  avatarUpdatedAt: string | null;
  contributionShare: number | null;
  githubContributionShare: number | null;
  documentContributionShare: number | null;
  flags: string[];
  tasks: { open: number; done: number };
}

/** One tag per student-facing label (free-rider and inactive both read "Low contribution"). */
const uniqueByLabel = (flags: string[]) => flags.filter((f, i) => flags.findIndex((g) => studentFlagLabel(g) === studentFlagLabel(f)) === i);

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

/** The name cell of a row: a button that opens the member's window when the card can open it. */
function RowLead({ open, name, children }: { open?: (opener: HTMLElement) => void; name: string; children: React.ReactNode }) {
  if (!open) return <div className="flex min-w-0 items-start gap-3">{children}</div>;
  return (
    <button
      type="button"
      data-open-member
      aria-label={`Open ${name}'s details`}
      onClick={(e) => open(e.currentTarget)}
      className="flex min-h-10 min-w-0 items-start gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
    >
      {children}
    </button>
  );
}

/** Leader-only team view. The server only sends `team` to the group's leader. */
export function LeaderTeamCard({ team, sourceType, noActivity = false, currentUserId, onOpenMember }: {
  team: LeaderTeamMember[]; sourceType: string; noActivity?: boolean; currentUserId?: number;
  /** Opens that member's window. With it, every row is clickable; without it the rows are plain. */
  onOpenMember?: (userId: number, opener: HTMLElement) => void;
}) {
  const combined = sourceType === "COMBINED";
  const equalPct = team.length > 0 ? 100 / team.length : 0;
  return (
    <section aria-labelledby="leader-team-title" className="h-full rounded-xl border border-slate-200 bg-white p-4">
      <h2 id="leader-team-title" className="flex items-center gap-1 text-sm font-semibold text-slate-900">
        Team contributions
        <InfoTip label="About the team contributions view" helpHref={helpLink("ai")}>{TIPS.leaderTeam}</InfoTip>
      </h2>
      <p className="mt-1 text-xs leading-normal text-slate-700">Equal share: {equalPct.toFixed(1)}% each.</p>
      <ul className="mt-3 divide-y divide-slate-200">
        {team.map((m) => (
          <li
            key={m.userId}
            className={`grid grid-cols-1 items-start gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_7.5rem] ${onOpenMember ? "cursor-pointer rounded-lg hover:bg-slate-50" : ""}`}
            onClick={onOpenMember ? (e) => {
              // A click anywhere on the row opens the window; the name button handles its own click.
              if ((e.target as HTMLElement).closest("button")) return;
              const opener = e.currentTarget.querySelector<HTMLElement>("button[data-open-member]");
              if (opener) onOpenMember(m.userId, opener);
            } : undefined}
          >
            <RowLead open={onOpenMember ? (el) => onOpenMember(m.userId, el) : undefined} name={m.name}>
              <Avatar
                userId={m.userId}
                name={m.name}
                avatarUpdatedAt={m.avatarUpdatedAt}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-900"
              />
              <span className="block min-w-0">
                <span className="block break-words text-sm font-semibold text-slate-900">
                  {m.name}{m.userId === currentUserId ? <span className="ml-2 rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-900">You</span> : null}{m.isLeader ? <span className="ml-2 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-900">Leader</span> : null}
                </span>
                <span className="block text-xs text-slate-700">
                  {m.functionalRoles.map((r) => (r === "DOCUMENTATION" ? "Documentation" : "Developer")).join(" · ") || "No role set"}
                </span>
              </span>
            </RowLead>
            <div className="min-w-0">
              {noActivity ? (
                <NoActivityPill />
              ) : (
                <>
                  <p className="text-sm tabular-nums text-slate-900">
                    <span className="font-semibold">{pct(m.contributionShare)}</span>
                    <span className="text-xs text-slate-700"> share</span>
                  </p>
                  {m.contributionShare !== null && <ShareBar pct={m.contributionShare * 100} fairPct={equalPct} />}
                  {combined && (
                    <p className="text-xs tabular-nums text-slate-700">
                      GitHub {pct(m.githubContributionShare)} · Docs {pct(m.documentContributionShare)}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {m.flags.length === 0
                      ? <span className="text-xs text-slate-700">No flags</span>
                      : uniqueByLabel(m.flags).map((f) => <FlagTag key={f} flag={f as Flag} view={m.userId === currentUserId ? "own" : "peer"} />)}
                  </div>
                </>
              )}
            </div>
            <p className="text-xs tabular-nums text-slate-700 sm:text-right">
              {m.tasks.open + m.tasks.done === 0 ? "No tasks" : `Tasks: ${taskCountLabel(m.tasks.done, m.tasks.open + m.tasks.done)}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
