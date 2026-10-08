import type { Flag, TeamHealth } from "@shared/types";

// Each tone is a foreground/background pair with a contrast ratio of at least 4.5:1 (checked in
// StatusPill.test.tsx from the hex values below, which are the palette values behind the class
// names). Meaning is always carried by the text label and an icon, never by colour.
export type PillTone = "green" | "amber" | "red" | "orange" | "yellow" | "violet" | "sky" | "indigo" | "neutral";

export const PILL_TONES: Record<PillTone, { cls: string; fg: string; bg: string }> = {
  green:   { cls: "bg-emerald-100 text-emerald-900 border-emerald-300", fg: "#064e3b", bg: "#d1fae5" },
  amber:   { cls: "bg-amber-100 text-amber-900 border-amber-300",       fg: "#78350f", bg: "#fef3c7" },
  red:     { cls: "bg-red-100 text-red-900 border-red-300",             fg: "#7f1d1d", bg: "#fee2e2" },
  orange:  { cls: "bg-orange-100 text-orange-900 border-orange-300",    fg: "#7c2d12", bg: "#ffedd5" },
  yellow:  { cls: "bg-yellow-100 text-yellow-900 border-yellow-300",    fg: "#713f12", bg: "#fef9c3" },
  violet:  { cls: "bg-violet-100 text-violet-900 border-violet-300",    fg: "#4c1d95", bg: "#ede9fe" },
  sky:     { cls: "bg-sky-100 text-sky-900 border-sky-300",             fg: "#0c4a6e", bg: "#e0f2fe" },
  indigo:  { cls: "bg-indigo-100 text-indigo-900 border-indigo-300",    fg: "#312e81", bg: "#e0e7ff" },
  neutral: { cls: "bg-slate-100 text-slate-800 border-slate-300",       fg: "#1e293b", bg: "#f1f5f9" },
};

export const HEALTH_LABEL: Record<TeamHealth, string> = {
  Healthy: "Healthy",
  "Moderate Risk": "Moderate risk",
  "High Risk": "High risk",
};
const HEALTH_TONE: Record<TeamHealth, PillTone> = { Healthy: "green", "Moderate Risk": "amber", "High Risk": "red" };

export const FLAG_LABEL: Record<Flag, string> = {
  inactive: "Inactive",
  "free-rider": "Free-rider",
  overload: "Overload",
  "deadline-driven": "Deadline-driven",
};
const FLAG_TONE: Record<Flag, PillTone> = { inactive: "red", "free-rider": "red", overload: "orange", "deadline-driven": "yellow" };

type Props =
  | { kind: "health"; value: TeamHealth; className?: string }
  | { kind: "flag"; value: Flag; className?: string }
  | { kind: "status"; label: string; tone?: PillTone; className?: string };

function Icon({ kind }: { kind: "ok" | "alert" | "clock" | "dot" }) {
  const common = { className: "h-4 w-4 shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2.5, "aria-hidden": true } as const;
  if (kind === "ok") return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;
  if (kind === "clock") return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
  if (kind === "alert") return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>;
}

/** Health level, flag or status — always text plus an icon, never colour alone. */
export function StatusPill(props: Props) {
  let tone: PillTone;
  let label: string;
  let icon: "ok" | "alert" | "clock" | "dot";
  if (props.kind === "health") {
    tone = HEALTH_TONE[props.value];
    label = HEALTH_LABEL[props.value];
    icon = props.value === "Healthy" ? "ok" : "alert";
  } else if (props.kind === "flag") {
    tone = FLAG_TONE[props.value];
    label = FLAG_LABEL[props.value];
    icon = props.value === "deadline-driven" ? "clock" : "alert";
  } else {
    tone = props.tone ?? "neutral";
    label = props.label;
    icon = "dot";
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold leading-normal ${PILL_TONES[tone].cls} ${props.className ?? ""}`}>
      <Icon kind={icon} />
      {label}
    </span>
  );
}
