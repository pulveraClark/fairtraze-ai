import type { Crumb } from "../components/layout/Breadcrumbs";

// The class label itself lives in shared/ so the server and the client can never differ; re-exported here
// so existing imports keep working.
import { classFullLabel, type ClassCodes } from "@shared/classLabel";
export { classFullLabel };
export type { ClassCodes };

/** Where space is tight (breadcrumb, sidebar): the subject code only. The full label goes in a tooltip. */
export function classShortLabel(c: ClassCodes, fallback = "Class"): string {
  return c.subjectCode?.trim() || fallback;
}

/** Tooltip for the short label; undefined when the short label already says everything. */
export function classTooltip(c: ClassCodes): string | undefined {
  return c.edpCode?.trim() && c.subjectCode?.trim() ? classFullLabel(c) : undefined;
}

/** A breadcrumb for a class: subject code, with the full label as its tooltip. */
export function classCrumb(c: ClassCodes | null | undefined, href?: string): Crumb {
  return { label: classShortLabel(c ?? {}), title: c ? classTooltip(c) : undefined, ...(href ? { href } : {}) };
}

/** What the printed instructor export calls the class: "CODE · Subject — Assignment title". */
export interface ExportClassSource {
  assignmentLabel?: string;
  classCode?: string;
  classEdpCode?: string;
  classSubjectName?: string;
  assignmentTitle?: string;
}

/** The server's placeholder for a group whose legacy label is empty. It is never printed as a class. */
export const NO_CLASS_PLACEHOLDER = "General Assignment";

export function exportClassLabel(meta: ExportClassSource | null | undefined): string {
  const cls = [meta?.classCode?.trim(), meta?.classSubjectName?.trim()].filter(Boolean).join(" · ");
  const title = meta?.assignmentTitle?.trim();
  if (cls) return title ? `${cls} — ${title}` : cls;
  const legacy = meta?.assignmentLabel?.trim();
  return legacy && legacy !== NO_CLASS_PLACEHOLDER ? legacy : "";
}
