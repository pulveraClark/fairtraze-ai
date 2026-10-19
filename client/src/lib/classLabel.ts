import type { Crumb } from "../components/layout/Breadcrumbs";

/** The two official codes of a class section. The EDP code is the school's own code and always stays visible. */
export interface ClassCodes {
  subjectCode?: string | null;
  edpCode?: string | null;
}

/** The one format every screen uses for a class: "UXA-101 · EDP 12345" (just "UXA-101" when it has no EDP code). */
export function classFullLabel(c: ClassCodes): string {
  const subject = c.subjectCode?.trim() ?? "";
  const edp = c.edpCode?.trim() ?? "";
  if (subject && edp) return `${subject} · EDP ${edp}`;
  return subject || (edp ? `EDP ${edp}` : "");
}

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
