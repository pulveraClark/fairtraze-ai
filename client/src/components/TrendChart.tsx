import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Dot,
} from "recharts";
import type { ReportHistoryPoint, TeamHealth } from "@shared/types";

interface Props {
  history: ReportHistoryPoint[];
}

interface ChartDataPoint {
  label: string;
  gini: number | null;
  teamHealth: TeamHealth | null;
}

const HEALTH_COLOR: Record<TeamHealth, string> = {
  "Healthy":        "#6366f1", // indigo
  "Moderate Risk":  "#f59e0b", // amber
  "High Risk":      "#ef4444", // red
};

function dotColor(teamHealth: TeamHealth | null): string {
  return teamHealth ? HEALTH_COLOR[teamHealth] : "#94a3b8";
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: ChartDataPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
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
      <p className="font-medium text-slate-700">{pt.label}</p>
      <p className="text-slate-500">Gini: {pt.gini !== null ? pt.gini.toFixed(3) : "—"}</p>
      {pt.teamHealth && <p className="text-slate-500">{pt.teamHealth}</p>}
    </div>
  );
}

const LEGEND_ENTRIES: Array<{ color: string; label: TeamHealth }> = [
  { color: HEALTH_COLOR["Healthy"],       label: "Healthy" },
  { color: HEALTH_COLOR["Moderate Risk"], label: "Moderate Risk" },
  { color: HEALTH_COLOR["High Risk"],     label: "High Risk" },
];

export function TrendChart({ history }: Props) {
  const data: ChartDataPoint[] = history.map((h) => ({
    label: new Date(h.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    gini: h.gini,
    teamHealth: h.teamHealth,
  }));

  const usedColors = new Set(data.map((d) => dotColor(d.teamHealth)));
  const visibleLegend = LEGEND_ENTRIES.filter((e) => usedColors.has(e.color));

  return (
    <>
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 1]}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={0.2} stroke="#94a3b8" strokeDasharray="4 4" />
        <ReferenceLine y={0.4} stroke="#94a3b8" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="gini"
          stroke="#6366f1"
          strokeWidth={2}
          dot={(props) => {
            const { cx, cy, payload, key } = props as { cx: number; cy: number; payload: ChartDataPoint; key: string };
            return <Dot key={key} cx={cx} cy={cy} r={4} fill={dotColor(payload.teamHealth)} stroke="#fff" strokeWidth={1} />;
          }}
          activeDot={{ r: 6 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
    {visibleLegend.length > 0 && (
      <div className="flex items-center gap-4 px-1 pt-1 pb-2 flex-wrap">
        {visibleLegend.map((e) => (
          <span key={e.color} className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
            {e.label}
          </span>
        ))}
      </div>
    )}
    </>
  );
}
