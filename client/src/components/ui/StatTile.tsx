import type { ReactNode } from "react";
import { CARD } from "./styles";

interface Props {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  /** A 0–1 bar. Its value is also exposed as text through `valueText`. */
  bar?: { value: number; label: string; valueText: string };
  /** Tint for the whole tile (used for team health). */
  tone?: "neutral" | "green" | "amber" | "red";
}

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  neutral: "border-slate-200 bg-white",
  green: "border-emerald-300 bg-emerald-50",
  amber: "border-amber-300 bg-amber-50",
  red: "border-red-300 bg-red-50",
};

export function StatTile({ label, value, detail, bar, tone = "neutral" }: Props) {
  const clamped = bar ? Math.min(1, Math.max(0, bar.value)) : 0;
  return (
    <div className={`${CARD} min-w-0 p-4 ${TONE[tone]}`}>
      <p className="text-[0.8125rem] font-medium leading-normal text-slate-700">{label}</p>
      <div className="mt-1 break-words text-2xl font-bold leading-tight text-slate-900">{value}</div>
      {bar && (
        <div
          role="meter"
          aria-label={bar.label}
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={clamped}
          aria-valuetext={bar.valueText}
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200"
        >
          <div className="h-full rounded-full bg-indigo-700" style={{ width: `${clamped * 100}%` }} />
        </div>
      )}
      {detail && <div className="mt-2 break-words text-[0.8125rem] leading-normal text-slate-700">{detail}</div>}
    </div>
  );
}
