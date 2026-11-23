import { ShareBar } from "./report/DrawerParts";
import { InfoTip } from "./ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";

/** One compact tile with a member's own overall share and the equal-share tick (replaces the old hero card). */
export function YourShareTile({ share, memberCount, onOpen }: { share: number; memberCount: number; onOpen?: (opener: HTMLElement) => void }) {
  const equal = memberCount > 0 ? 100 / memberCount : null;
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-1 text-sm font-semibold text-slate-900">
          Your share
          {equal !== null && (
            <InfoTip label="About the equal-share marker" helpHref={helpLink("shares")}>
              {TIPS.equalShareMember(equal, memberCount)}
            </InfoTip>
          )}
        </h2>
        <span className="text-xl font-semibold tabular-nums text-slate-900">{(share * 100).toFixed(1)}%</span>
      </div>
      <ShareBar pct={share * 100} fairPct={equal} />
    </>
  );
  if (!onOpen) return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">{body}</div>;
  // Clickable: opens the member's own window (the same one the leader opens for each member).
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      {body}
      <button
        type="button"
        onClick={(e) => onOpen(e.currentTarget)}
        className="mt-1 inline-flex min-h-10 items-center rounded-lg text-sm font-medium text-blue-800 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        See your details
      </button>
    </div>
  );
}
