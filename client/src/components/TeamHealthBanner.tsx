import type { TeamHealth } from "@shared/types";
import { InfoTooltip, TipList } from "./InfoTooltip";

// Strong colored card background per health level — this card is the
// intended visual focal point of the report, so it reads at a glance.
const cardStyles: Record<TeamHealth, string> = {
  Healthy:         "bg-emerald-50 border-emerald-200",
  "Moderate Risk": "bg-amber-50 border-amber-200",
  "High Risk":     "bg-red-50 border-red-200",
};

const badgeStyles: Record<TeamHealth, string> = {
  Healthy:         "bg-emerald-100 text-emerald-800 border border-emerald-300",
  "Moderate Risk": "bg-amber-100 text-amber-800 border border-amber-300",
  "High Risk":     "bg-red-100 text-red-800 border border-red-300",
};

const labelStyles: Record<TeamHealth, string> = {
  Healthy:         "text-emerald-700",
  "Moderate Risk": "text-amber-700",
  "High Risk":     "text-red-700",
};

interface Props {
  teamHealth: TeamHealth;
  gini: number;
  projectName: string;
  memberCount?: number;
}

export function TeamHealthBanner({ teamHealth, gini, projectName, memberCount }: Props) {
  return (
    <div className={`border-2 rounded-xl shadow-sm p-6 ${cardStyles[teamHealth]}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${labelStyles[teamHealth]}`}>
        {projectName}
      </p>
      <h2 className="text-sm font-semibold text-slate-700 mb-3">Team Health</h2>
      <div className="flex items-center gap-4 flex-wrap">
        <span className="inline-flex items-center gap-0.5">
          <span
            className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-base font-bold ${badgeStyles[teamHealth]}`}
          >
            {teamHealth}
          </span>
          <InfoTooltip
            label="What is Team Health?"
            content={
              <TipList items={[
                ["How evenly", "contribution is spread across the team"],
                ["0 = equal,", "higher = more lopsided"],
                ["Healthy", "< 0.2"],
                ["Moderate", "0.2 – 0.4"],
                ["High Risk", "≥ 0.4"],
              ]} />
            }
          />
        </span>
        <span className="text-slate-700 text-sm">
          Gini:{" "}
          <span className="font-bold text-slate-900 text-base">{gini.toFixed(3)}</span>
          <span className="ml-1 text-slate-500 text-xs">
            (
            {teamHealth === "Healthy"
              ? "low inequality"
              : teamHealth === "Moderate Risk"
              ? "moderate inequality"
              : "high inequality"}
            )
          </span>
        </span>
        {memberCount !== undefined && (
          <span className="text-slate-600 text-sm">{memberCount} members</span>
        )}
      </div>
    </div>
  );
}
