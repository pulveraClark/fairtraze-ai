const MEMBER_COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
];

interface MemberShare {
  studentName: string;
  contributionShare: number;
}

interface Props {
  memberShares: MemberShare[];
}

export function ContributionMiniBar({ memberShares }: Props) {
  if (memberShares.length === 0) {
    return <div className="h-3 rounded-full bg-slate-100 w-full" />;
  }

  // Normalise so the segments always fill 100% even if shares don't perfectly sum to 1
  const total = memberShares.reduce((s, m) => s + m.contributionShare, 0) || 1;

  return (
    <div className="flex h-3 rounded-full overflow-hidden w-full gap-px">
      {memberShares.map((m, i) => {
        const pct = (m.contributionShare / total) * 100;
        const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
        return (
          <div
            key={m.studentName}
            title={`${m.studentName}: ${(m.contributionShare * 100).toFixed(1)}%`}
            style={{ width: `${pct}%`, backgroundColor: color }}
            className="shrink-0"
          />
        );
      })}
    </div>
  );
}
