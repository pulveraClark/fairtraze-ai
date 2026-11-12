import type { StoredReportResponse } from "@shared/types";
import type { ExportClassSource } from "../lib/classLabel";
import { evidenceDtoFromStored } from "../lib/evidenceFromStored";
import { usePrintTitle } from "../hooks/usePrintTitle";
import { EvidencePrintStyles } from "./EvidencePrintStyles";
import { EvidenceSheet } from "./EvidenceSheet";
import type { BulkPosition } from "../lib/evidenceLayout";

// The instructor's printed export is the same sheet as the student's Contribution Evidence Report, marked
// INSTRUCTOR COPY and with the Gini index row. Everything comes from the stored analysis; no Report ID is made
// here (the sheet says "Not issued" when none exists), and the AI narrative is not printed.

interface Props {
  stored: StoredReportResponse;
  /** Class and assignment names for the info block (the group's entry from /api/projects/summary). */
  meta?: ExportClassSource | null;
  /** Set by the bulk export: this sheet's place among the sheets. */
  bulk?: BulkPosition;
  /** Bulk export only: a page break after this sheet, so the next group starts on a new page. */
  breakAfter?: boolean;
}

/** The sheet itself, without the print-only wrapper, so the bulk export can lay several out. */
export function InstructorEvidenceSheet({ stored, meta, bulk }: Pick<Props, "stored" | "meta" | "bulk">) {
  const dto = evidenceDtoFromStored(stored, meta);
  return (
    <EvidenceSheet
      dto={dto}
      instructor={{
        gini: stored.report.gini,
        teamHealth: stored.report.teamHealth,
        reportId: stored.evidenceReportId ?? null,
        bulk,
      }}
    />
  );
}

export function PrintableReport({ stored, meta, bulk, breakAfter }: Props) {
  usePrintTitle(`Contribution Evidence Report - ${stored.groupName} (Instructor copy)`);
  return (
    <div
      className={`hidden print:block${breakAfter ? " ft-evidence-bulk-break" : ""}`}
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}
    >
      <EvidencePrintStyles />
      <InstructorEvidenceSheet stored={stored} meta={meta} bulk={bulk} />
    </div>
  );
}
