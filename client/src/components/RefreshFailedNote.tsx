import { useEffect, useState } from "react";
import { BUTTON_SECONDARY } from "./ui/styles";
import { quotaStillBlocked, refreshFailedLine, type AiRefreshNote } from "../lib/aiReview";

interface Props {
  note: AiRefreshNote;
  /** Present only for a viewer who can generate (the instructor); the group leader just reads the note. */
  onTryAgain?: () => void;
  busy?: boolean;
}

/**
 * Shown above a check that is kept from an earlier run because the latest run failed. For the daily
 * limit, Try again stays disabled until the stated reset time.
 */
export function RefreshFailedNote({ note, onTryAgain, busy = false }: Props) {
  const [now, setNow] = useState(() => new Date());
  const blocked = note.errorCode === "AI_QUOTA_DAILY" && quotaStillBlocked(note.retryAt, now);

  // Wake up once, when the reset time passes, so the button enables itself without a reload.
  useEffect(() => {
    if (!blocked || !note.retryAt) return;
    const wait = Math.min(Date.parse(note.retryAt) - Date.now() + 1000, 2_147_483_647);
    const t = setTimeout(() => setNow(new Date()), Math.max(wait, 1000));
    return () => clearTimeout(t);
  }, [blocked, note.retryAt]);

  return (
    <div role="status" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-normal text-slate-800">
      <span className="min-w-0 [overflow-wrap:anywhere]">{refreshFailedLine(note, now)}</span>
      {onTryAgain && (
        <button
          type="button"
          onClick={onTryAgain}
          disabled={busy || blocked}
          className={`${BUTTON_SECONDARY} min-h-10`}
        >
          Try again
        </button>
      )}
    </div>
  );
}
