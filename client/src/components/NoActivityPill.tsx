import { StatusPill } from "./ui/StatusPill";
import { NO_ACTIVITY_LABEL } from "../lib/groupActivity";

/** Grey, text-only replacement for a health label while a group has no recorded activity. */
export function NoActivityPill({ className = "" }: { className?: string }) {
  return <StatusPill kind="status" tone="neutral" label={NO_ACTIVITY_LABEL} className={className} />;
}
