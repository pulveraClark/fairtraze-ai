import { Avatar } from "./Avatar";
import type { Flag } from "@shared/types";
import { FlagTag } from "./FlagTag";

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

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

/** Leader-only team view. The server only sends `team` to the group's leader. */
export function LeaderTeamCard({ team, sourceType }: { team: LeaderTeamMember[]; sourceType: string }) {
  const combined = sourceType === "COMBINED";
  const equalPct = team.length > 0 ? 100 / team.length : 0;
  return (
    <section aria-labelledby="leader-team-title" className="h-full rounded-xl border border-slate-200 bg-white p-4">
      <h2 id="leader-team-title" className="text-sm font-semibold text-slate-900">Team contributions</h2>
      <p className="mt-1 text-xs leading-normal text-slate-700">
        This view is for distributing work fairly. Shares are evidence from recorded activity, not grades, and your instructor
        makes the final assessment. The equal share is {equalPct.toFixed(1)}% each.
      </p>
      <ul className="mt-3 divide-y divide-slate-200">
        {team.map((m) => (
          <li key={m.userId} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-3 sm:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1.6fr)_auto]">
            <Avatar
              userId={m.userId}
              name={m.name}
              avatarUpdatedAt={m.avatarUpdatedAt}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-900"
            />
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-slate-900">
                {m.name}{m.isLeader ? <span className="ml-2 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-900">Leader</span> : null}
              </p>
              <p className="text-xs text-slate-700">
                {m.functionalRoles.map((r) => (r === "DOCUMENTATION" ? "Documentation" : "Developer")).join(" · ") || "No role set"}
              </p>
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <p className="text-sm tabular-nums text-slate-900">
                <span className="font-semibold">{pct(m.contributionShare)}</span>
                <span className="text-xs text-slate-700"> share</span>
              </p>
              {combined && (
                <p className="text-xs tabular-nums text-slate-700">
                  GitHub {pct(m.githubContributionShare)} · Docs {pct(m.documentContributionShare)}
                </p>
              )}
              <div className="mt-1 flex flex-wrap gap-1.5">
                {m.flags.length === 0 ? <span className="text-xs text-slate-700">No flags</span> : m.flags.map((f) => <FlagTag key={f} flag={f as Flag} />)}
              </div>
            </div>
            <p className="col-span-2 text-xs tabular-nums text-slate-700 sm:col-span-1 sm:text-right">
              Tasks: {m.tasks.open} open · {m.tasks.done} done
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
