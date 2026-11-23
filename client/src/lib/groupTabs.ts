export type GroupTab = "report" | "document" | "tasks";

const TABS: readonly GroupTab[] = ["report", "document", "tasks"];

/**
 * The tabs on a group page, in order; the first one is the default. Students start where they work
 * (FairTraze Docs, then Tasks, then Report); instructors start on the Report. GitHub-only projects have
 * no Docs tab, so the rest keep their relative order. `sourceType` is null while it is still loading.
 */
export function groupTabs(audience: "student" | "instructor", sourceType: string | null | undefined): GroupTab[] {
  const hasDocs = sourceType === "EDITOR" || sourceType === "COMBINED";
  if (audience === "student") return hasDocs ? ["document", "tasks", "report"] : ["tasks", "report"];
  return hasDocs ? ["report", "document", "tasks"] : ["report", "tasks"];
}

/** The tab named by `?tab=` in a URL query string, or null when absent or unknown. */
export function tabFromSearch(search: string): GroupTab | null {
  const raw = new URLSearchParams(search).get("tab");
  return TABS.find((t) => t === raw) ?? null;
}

/** The tab to show: the requested one if this page has it, otherwise the first (default) tab. */
export function resolveTab(wanted: GroupTab | null, tabs: GroupTab[]): GroupTab {
  return wanted && tabs.includes(wanted) ? wanted : tabs[0]!;
}
