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

// "Setup complete" is announced once per user and group, so a reload or a later visit never repeats it.
const doneKey = (userId: number | null, projectId: number) => `ft.setup.completeShown.${userId ?? "anon"}.${projectId}`;

export function readSetupCompleteShown(userId: number | null, projectId: number): boolean {
  try {
    return window.localStorage.getItem(doneKey(userId, projectId)) === "1";
  } catch {
    return false;
  }
}

export function storeSetupCompleteShown(userId: number | null, projectId: number): void {
  try {
    window.localStorage.setItem(doneKey(userId, projectId), "1");
  } catch {
    /* the announcement is a convenience only */
  }
}
