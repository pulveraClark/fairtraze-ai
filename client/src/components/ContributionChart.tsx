import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ScoredMember, Flag } from "@shared/types";

interface Props {
  members: ScoredMember[];
}

interface ChartDataPoint {
  name: string;
  value: number;
  flags: Flag[];
}

function barColor(flags: Flag[]): string {
  if (flags.includes("inactive") || flags.includes("free-rider")) return "#ef4444";
  if (flags.includes("overload")) return "#f97316";
  return "#4f86c6";
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: ChartDataPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0];
  return (
    <div
      style={{
        fontSize: 12,
        borderRadius: 8,
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        background: "#fff",
        padding: "6px 10px",
      }}
    >
      <p className="font-medium text-slate-700">{pt.payload.name}</p>
      <p className="text-slate-500">{pt.value}% contribution share</p>
    </div>
  );
}

export function ContributionChart({ members }: Props) {
  const equalShare = members.length > 0 ? (1 / members.length) * 100 : 0;

  const data: ChartDataPoint[] = members.map((m) => ({
    name: m.studentName,
    value: parseFloat((m.contributionShare * 100).toFixed(1)),
    flags: m.flags,
  }));

  return (
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
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine
          y={equalShare}
          stroke="#94a3b8"
          strokeDasharray="4 4"
          label={{
            value: "Equal share",
            position: "insideTopRight",
            fontSize: 10,
            fill: "#94a3b8",
          }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {data.map((entry, i) => (
            <Cell key={`cell-${i}`} fill={barColor(entry.flags)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
