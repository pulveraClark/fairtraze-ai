// Which of the three Tasks views is showing: remembered per user in localStorage (best effort)
// and mirrored to ?view= so a reload or a shared link lands on the same one.

export const TASK_VIEWS = ["board", "list", "calendar"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export const TASK_VIEW_LABELS: Record<TaskView, string> = { board: "Board", list: "List", calendar: "Calendar" };

export function parseView(raw: string | null | undefined): TaskView | null {
  return (TASK_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as TaskView) : null;
}

const storageKey = (userId: number | null) => `ft.tasks.view.${userId ?? "anon"}`;

export function readStoredView(userId: number | null): TaskView | null {
  try {
    return parseView(window.localStorage.getItem(storageKey(userId)));
  } catch {
    return null; // storage can be blocked or throw (private windows, site data off)
  }
}

export function storeView(userId: number | null, view: TaskView): void {
  try {
    window.localStorage.setItem(storageKey(userId), view);
  } catch {
    /* remembering the view is a convenience only */
  }
}

/** ?view= wins over the remembered view; the default is the board. */
export function initialView(userId: number | null, search: string = window.location.search): TaskView {
  return parseView(new URLSearchParams(search).get("view")) ?? readStoredView(userId) ?? "board";
}

/** Keep ?view= in the address bar without adding a history entry (same as ?tab= and ?task=). */
export function syncViewToUrl(view: TaskView): void {
  const url = new URL(window.location.href);
  if (view === "board") url.searchParams.delete("view"); else url.searchParams.set("view", view);
  window.history.replaceState(window.history.state, "", url);
}

export function clearViewFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("view")) return;
  url.searchParams.delete("view");
  window.history.replaceState(window.history.state, "", url);
}
