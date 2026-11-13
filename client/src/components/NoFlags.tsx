import { HoverTip } from "./report/DrawerParts";

/**
 * "No flags" with a short reason beside it. The reason is a tooltip that opens on hover, keyboard focus
 * or tap (HoverTip), and it is plain text, so it never relies on colour. Use where the label is not
 * itself inside a button.
 */
export function NoFlags({ reason, className = "text-sm text-slate-700", label = "No flags" }: { reason: string | null; className?: string; label?: string }) {
  if (!reason) return <span className={className}>{label}</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className={className}>{label}</span>
      <HoverTip label="Why no flags">{reason}</HoverTip>
    </span>
  );
}
