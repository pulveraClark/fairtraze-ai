// "Do this later" on the leader's setup screen is remembered per user per group in localStorage (best effort),
// like the Tasks filters. It only hides the first-visit screen; the nudge bar can always reopen the steps.

const storageKey = (userId: number | null, projectId: number) => `ft.setup.skip.${userId ?? "anon"}.${projectId}`;

export function readSetupSkipped(userId: number | null, projectId: number): boolean {
  try {
    return window.localStorage.getItem(storageKey(userId, projectId)) === "1";
  } catch {
    return false; // storage can be blocked or throw (private windows, site data off)
  }
}

export function storeSetupSkipped(userId: number | null, projectId: number): void {
  try {
    window.localStorage.setItem(storageKey(userId, projectId), "1");
  } catch {
    /* remembering the skip is a convenience only */
  }
}
