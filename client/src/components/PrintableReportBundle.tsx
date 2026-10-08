import type { StoredReportResponse } from "@shared/types";
import { PrintableReport } from "./PrintableReport";

export interface PrintableReportBundleItem {
  projectId: number;
  stored: StoredReportResponse;
  narrative: string | null;
  assignmentLabel: string;
}

interface Props {
  items: PrintableReportBundleItem[];
}

// Bulk export: composes several single-project PrintableReport instances into one
// print pass (one window.print() call = one combined PDF via the OS print dialog),
// instead of a per-project PDF library or a zip of separate files — no new
// dependencies, direct extension of the existing single-project print flow.
export function PrintableReportBundle({ items }: Props) {
  return (
    <>
      {items.map((item, i) => (
        <div key={item.projectId} style={i < items.length - 1 ? { breakAfter: "page" } : undefined}>
          <PrintableReport
            stored={item.stored}
            narrative={item.narrative}
            assignmentLabel={item.assignmentLabel}
            showFooter={i === items.length - 1}
          />
        </div>
      ))}
    </>
  );
}
