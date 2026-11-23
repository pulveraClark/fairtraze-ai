import { parseClassLabel } from "../components/ClassCard";
import { NO_CLASS_PLACEHOLDER, classFullLabel } from "./classLabel";

interface CrumbSource {
  assignmentLabel?: string;
  classCode?: string;
  classEdpCode?: string;
  assignmentTitle?: string;
}

const NO_LABEL = NO_CLASS_PLACEHOLDER; // the server's placeholder for a group with an empty assignmentLabel

/**
 * Names for the class and assignment crumbs of a group page. Uses the real class code and assignment
 * title from the summary; only older payloads without them fall back to parsing the display label
 * ("CODE — Subject"), and the server's "General Assignment" placeholder is never shown as a class.
 */
export function groupCrumbLabels(meta: CrumbSource | null | undefined): { classLabel: string; assignmentLabel: string } {
  const legacy = meta?.assignmentLabel && meta.assignmentLabel !== NO_LABEL ? parseClassLabel(meta.assignmentLabel) : null;
  return {
    // "CODE · EDP 12345" (shared classFullLabel); just the code when the class has no EDP
    classLabel: (meta?.classCode && classFullLabel({ subjectCode: meta.classCode, edpCode: meta.classEdpCode })) || legacy?.code || "Class",
    assignmentLabel: meta?.assignmentTitle || "Assignment",
  };
}
