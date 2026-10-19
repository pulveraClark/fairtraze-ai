import { ShareBar } from "./report/DrawerParts";
import { InfoTip } from "./ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";

/** One compact tile with a member's own overall share and the equal-share tick (replaces the old hero card). */
export function YourShareTile({ share, memberCount }: { share: number; memberCount: number }) {
  const equal = memberCount > 0 ? 100 / memberCount : null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
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
    </div>
  );
}
