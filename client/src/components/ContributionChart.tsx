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
  if (flags.includes("inactive") || flags.includes("free-rider")) return "#ef4444"; // red
  if (flags.includes("overload"))         return "#f97316"; // orange
  if (flags.includes("deadline-driven"))  return "#f59e0b"; // amber
  return "#6366f1"; // indigo — healthy / no flags
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

const LEGEND_ENTRIES = [
  { color: "#6366f1", label: "Healthy" },
  { color: "#f59e0b", label: "Deadline-driven" },
  { color: "#f97316", label: "Overload" },
  { color: "#ef4444", label: "Inactive / Free-rider" },
] as const;

export function ContributionChart({ members }: Props) {
  const equalShare = members.length > 0 ? (1 / members.length) * 100 : 0;

  const data: ChartDataPoint[] = members.map((m) => ({
    name: m.studentName,
    value: parseFloat((m.contributionShare * 100).toFixed(1)),
    flags: m.flags,
  }));

  const usedColors = new Set(data.map((d) => barColor(d.flags)));
  const visibleLegend = LEGEND_ENTRIES.filter((e) => usedColors.has(e.color));

  return (
    <>
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
    {visibleLegend.length > 0 && (
      <div className="flex items-center gap-4 px-1 pt-1 pb-2 flex-wrap">
        {visibleLegend.map((e) => (
          <span key={e.color} className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: e.color }} />
            {e.label}
          </span>
        ))}
      </div>
    )}
    </>
  );
}
