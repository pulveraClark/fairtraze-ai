import type { StoredReportResponse } from "@shared/types";
import type { ExportClassSource } from "../lib/classLabel";
import { fitsOnePage } from "../lib/evidenceLayout";
import { usePrintTitle } from "../hooks/usePrintTitle";
import { EvidencePrintStyles } from "./EvidencePrintStyles";
import { InstructorEvidenceSheet } from "./PrintableReport";

export interface PrintableReportBundleItem {
  projectId: number;
  stored: StoredReportResponse;
  meta?: ExportClassSource | null;
}

interface Props {
  items: PrintableReportBundleItem[];
}

// Bulk export: one instructor sheet per group, each starting on a new page, in one print pass (one
// window.print() = one combined PDF). Each sheet shows its own Report ID if one exists (none is made here).
// "Page i of N" is shown only while every sheet is known to be a single page; if any group is large enough to
// flow onto a second page the numbers would be wrong, so they are left out.
export function PrintableReportBundle({ items }: Props) {
  usePrintTitle("Contribution Evidence Reports (Instructor copy)", true);
  const allFitOnePage = items.every((it) => fitsOnePage(it.stored.report.members.length));
  return (
    <div className="hidden print:block">
      <EvidencePrintStyles />
      {items.map((item, i) => (
        <div key={item.projectId} className={i < items.length - 1 ? "ft-evidence-bulk-break" : undefined}>
          <InstructorEvidenceSheet
            stored={item.stored}
            meta={item.meta}
            bulk={{ index: i + 1, count: items.length, allFitOnePage }}
          />
        </div>
      ))}
    </div>
  );
}
