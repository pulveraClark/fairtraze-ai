import type { ScoredMember, Flag } from "@shared/types";

const flagStyles: Record<Flag, string> = {
  inactive: "bg-red-100 text-red-700",
  "free-rider": "bg-red-100 text-red-700",
  overload: "bg-orange-100 text-orange-700",
  "deadline-driven": "bg-yellow-100 text-yellow-700",
};

interface Props {
  members: ScoredMember[];
}

function formatRatio(ratio: number | null): string {
  if (ratio === null) return "—";
  return ratio.toFixed(1);
}

export function MemberTable({ members }: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">
          <span className="font-mono text-xs text-slate-400 mr-1">Phase 5 ·</span>
          Participation Imbalance Detection
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="text-left px-6 py-3 font-medium">Student</th>
              <th className="text-left px-4 py-3 font-medium">GitHub</th>
              <th className="text-right px-4 py-3 font-medium">Commits</th>
              <th className="text-right px-4 py-3 font-medium">Churn</th>
              <th className="text-right px-4 py-3 font-medium">Active Days</th>
              <th className="text-right px-4 py-3 font-medium">Code Lines</th>
              <th className="text-right px-4 py-3 font-medium">Comment Lines</th>
              <th className="text-right px-4 py-3 font-medium">Blank Lines</th>
              <th className="text-right px-4 py-3 font-medium">Code:Comment</th>
              <th className="text-right px-4 py-3 font-medium">Contribution</th>
              <th className="text-left px-4 py-3 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => (
              <tr key={m.githubUsername} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-3 font-medium text-slate-800">{m.studentName}</td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{m.githubUsername}</td>
                <td className="px-4 py-3 text-right text-slate-700">{m.commits}</td>
                <td className="px-4 py-3 text-right text-slate-700">{m.churn.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-700">{m.activeDays}</td>
                <td className="px-4 py-3 text-right text-slate-700">{m.codeLinesAdded.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-700">{m.commentLinesAdded.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-400">{m.blankLinesAdded.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatRatio(m.codeToCommentRatio)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">
                  {(m.contributionShare * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {m.flags.length === 0 ? (
                      <span className="text-slate-300 text-xs">—</span>
                    ) : (
                      m.flags.map((flag) => (
                        <span
                          key={flag}
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${flagStyles[flag]}`}
                        >
                          {flag}
                        </span>
                      ))
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
