import { parseClassLabel } from "../components/ClassCard";

interface CrumbSource {
  assignmentLabel?: string;
  classCode?: string;
  assignmentTitle?: string;
}

const NO_LABEL = "General Assignment"; // the server's placeholder for a group with an empty assignmentLabel

/**
 * Names for the class and assignment crumbs of a group page. Uses the real class code and assignment
 * title from the summary; only older payloads without them fall back to parsing the display label
 * ("CODE — Subject"), and the server's "General Assignment" placeholder is never shown as a class.
 */
export function groupCrumbLabels(meta: CrumbSource | null | undefined): { classLabel: string; assignmentLabel: string } {
  const legacy = meta?.assignmentLabel && meta.assignmentLabel !== NO_LABEL ? parseClassLabel(meta.assignmentLabel) : null;
  return {
    classLabel: meta?.classCode || legacy?.code || "Class",
    assignmentLabel: meta?.assignmentTitle || "Assignment",
  };
}
