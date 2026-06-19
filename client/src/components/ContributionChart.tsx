import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { ScoredMember } from "@shared/types";

interface Props {
  members: ScoredMember[];
}

export function ContributionChart({ members }: Props) {
  const equalShare = members.length > 0 ? (1 / members.length) * 100 : 0;

  const data = members.map((m) => ({
    name: m.studentName.split(" ")[0],
    fullName: m.studentName,
    value: parseFloat((m.contributionShare * 100).toFixed(1)),
  }));

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">
        <span className="font-mono text-xs text-slate-400 mr-1">Phase 3 ·</span>
        Contribution Profiling
      </h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            unit="%"
            domain={[0, Math.max(100, ...data.map((d) => d.value)) + 5]}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            formatter={(value: number, _name: string, props: { payload?: { fullName: string } }) => [
              `${value}%`,
              props.payload?.fullName ?? "Contribution",
            ]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            }}
          />
          <ReferenceLine
            y={equalShare}
            stroke="#94a3b8"
            strokeDasharray="4 4"
            label={{ value: "Equal share", position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }}
          />
          <Bar dataKey="value" fill="#4f86c6" radius={[4, 4, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
