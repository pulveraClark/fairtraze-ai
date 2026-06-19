import type { ScoredMember } from "@shared/types";

interface Props {
  members: ScoredMember[];
}

function formatImpactBreakdown(bd: ScoredMember["commitImpactBreakdown"]): string {
  const parts: string[] = [];
  if (bd.structural > 0) parts.push(`${bd.structural} structural`);
  if (bd.functional  > 0) parts.push(`${bd.functional} functional`);
  if (bd.cosmetic    > 0) parts.push(`${bd.cosmetic} cosmetic`);
  if (bd.trivial     > 0) parts.push(`${bd.trivial} trivial`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function formatFileTypeBreakdown(bd: ScoredMember["fileTypeBreakdown"]): string {
  const parts: string[] = [];
  if (bd.source > 0) parts.push(`src ${bd.source}`);
  if (bd.test   > 0) parts.push(`test ${bd.test}`);
  if (bd.style  > 0) parts.push(`style ${bd.style}`);
  if (bd.docs   > 0) parts.push(`docs ${bd.docs}`);
  if (bd.config > 0) parts.push(`config ${bd.config}`);
  if (bd.other  > 0) parts.push(`other ${bd.other}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function isAllZero(m: ScoredMember): boolean {
  return (
    m.commits === 0 &&
    m.weightedAdditions === 0 &&
    m.commitImpactBreakdown.structural === 0 &&
    m.commitImpactBreakdown.functional === 0 &&
    m.commitImpactBreakdown.cosmetic === 0 &&
    m.commitImpactBreakdown.trivial === 0
  );
}

export function SignificanceTable({ members }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-800">Contribution Significance</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Weighted additions apply file-type and commit-impact multipliers. Self-churn measures lines
          a member added then later deleted themselves.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Member</th>
              <th className="text-left px-6 py-3 font-medium">Weighted Lines</th>
              <th className="text-left px-6 py-3 font-medium">Commit Impact</th>
              <th className="text-left px-6 py-3 font-medium">File-Type Lines</th>
              <th className="text-right px-6 py-3 font-medium">Self-Churn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => {
              const allZero = isAllZero(m);
              return (
                <tr key={m.githubUsername} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-800">{m.studentName}</td>
                  <td className="px-6 py-3 text-slate-700 tabular-nums">
                    {allZero ? "—" : m.weightedAdditions.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    {allZero ? "—" : formatImpactBreakdown(m.commitImpactBreakdown)}
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    {allZero ? "—" : formatFileTypeBreakdown(m.fileTypeBreakdown)}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {allZero ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span
                        className={
                          m.selfChurnRatio > 0.3
                            ? "text-amber-600 font-medium"
                            : "text-slate-700"
                        }
                      >
                        {(m.selfChurnRatio * 100).toFixed(1)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
