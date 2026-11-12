import { useEffect } from "react";
import { EvidenceSheet } from "../components/EvidenceSheet";
import { useAuth } from "../context/AuthContext";
import { ApiError, useEvidenceReportQuery } from "../hooks/useGroupQueries";
import { useRouter } from "../router";
import { BUTTON_PRIMARY, BUTTON_SECONDARY_COMPACT } from "../components/ui/styles";

// Print page for the Contribution Evidence Report (/group/:id/evidence). It renders outside the app
// shell (see usesShell in App.tsx), so printing needs no navigation hiding beyond the toolbar.
// The injected @page rule makes the sheet exactly Letter with no margin, which is also what removes
// the browser's own header and footer; the sheet carries its own 0.6in padding. The sheet is at least one Letter page and is never clipped. It overrides the
// app-wide A4 @page only while this page is mounted.
const PAGE_CSS = `
@page { size: Letter portrait; margin: 0; }
.ft-evidence-desk { background: #d4d4d8; min-height: 100vh; padding: 16px; overflow-x: auto; }
.ft-evidence-sheet {
  box-sizing: border-box; width: 8.5in; min-height: 11in; margin: 0 auto; padding: 0.6in 0.65in 0.5in;
  display: flex; flex-direction: column; box-shadow: 0 1px 6px rgba(0,0,0,0.25);
}
@media print {
  html, body { background: #ffffff !important; margin: 0 !important; }
  .ft-evidence-desk { background: #ffffff; padding: 0; min-height: 0; overflow: visible; }
  .ft-evidence-sheet { box-shadow: none; margin: 0; }
}
`;

export function EvidenceReportPage({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const { data, error, isLoading } = useEvidenceReportQuery(projectId);

  const backTo = user?.systemRole === "INSTRUCTOR" ? `/project/${projectId}` : `/student/group/${projectId}`;
  const status = error instanceof ApiError ? error.status : null;
  const message =
    status === 404 ? "No analysis yet."
    : status === 403 ? "You do not have access to this report."
    : error ? "Could not load the evidence report. Try again in a moment."
    : null;

  // The browser prints the page title in its header when headers are on; keep it short and restore it on leave.
  useEffect(() => {
    if (!data) return;
    const previous = document.title;
    document.title = `Contribution Evidence Report - ${data.groupName}`;
    return () => { document.title = previous; };
  }, [data]);

  return (
    <div className="ft-evidence-desk">
      <style>{PAGE_CSS}</style>
      <div className="print:hidden mx-auto mb-3 flex max-w-[8.5in] flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => navigate(backTo)} className={BUTTON_SECONDARY_COMPACT}>
          Back to group
        </button>
        {data && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-700">Set margins to None and untick headers and footers if your browser shows them.</span>
            <button type="button" onClick={() => window.print()} className={BUTTON_PRIMARY}>
              Print
            </button>
          </div>
        )}
      </div>

      {isLoading && <p role="status" className="print:hidden text-center text-sm text-slate-700">Loading the report…</p>}
      {message && <p role="alert" className="print:hidden text-center text-sm font-medium text-slate-800">{message}</p>}
      {data && <EvidenceSheet dto={data} />}
    </div>
  );
}
