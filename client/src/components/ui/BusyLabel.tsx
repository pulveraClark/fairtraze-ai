import { Spinner } from "./Spinner";

/**
 * Button content that shows a small spinner and a "Saving…" style label while busy.
 * Use inside an existing button together with `disabled={busy}`; button styles are not changed.
 *   <button disabled={busy}><BusyLabel busy={busy} idle="Save" busyText="Saving…" /></button>
 */
export function BusyLabel({ busy, idle, busyText }: { busy: boolean; idle: string; busyText: string }) {
  if (!busy) return <>{idle}</>;
  return (
    <span className="inline-flex items-center gap-2">
      <Spinner />
      {busyText}
    </span>
  );
}
