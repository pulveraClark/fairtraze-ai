import { useState } from "react";
import { FOCUS_LIGHT } from "../ui";
import { moreNoticesLabel, splitNotices, type ReportNotice } from "../../lib/reportNotices";

/** One notices region for the instructor report: the most important notice, the rest behind "n more notice(s)". */
export function ReportNotices({ notices }: { notices: ReportNotice[] }) {
  const [open, setOpen] = useState(false);
  const { visible, hidden } = splitNotices(notices);
  if (visible.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="report-notices">
      {visible.map((n) => <div key={n.id}>{n.node}</div>)}
      {hidden.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="report-more-notices"
            className={`ft-hit rounded px-2 text-sm font-medium text-indigo-800 underline underline-offset-2 hover:text-indigo-900 ${FOCUS_LIGHT}`}
          >
            {open ? "Hide notices" : moreNoticesLabel(hidden.length)}
          </button>
          <div id="report-more-notices" hidden={!open} className="space-y-2">
            {hidden.map((n) => <div key={n.id}>{n.node}</div>)}
          </div>
        </>
      )}
    </div>
  );
}
