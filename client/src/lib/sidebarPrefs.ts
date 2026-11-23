// Per-user sidebar collapsed preference. Browser storage can be unavailable or throw
// (private windows, blocked site data), so every access is wrapped; the sidebar then
// simply renders expanded and the preference is not remembered.

const keyFor = (userId: number) => `ft_sidebar_collapsed:${userId}`;

export function readSidebarCollapsed(userId: number): boolean {
  try {
    return window.localStorage.getItem(keyFor(userId)) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(userId: number, collapsed: boolean): void {
  try {
    window.localStorage.setItem(keyFor(userId), collapsed ? "1" : "0");
  } catch {
    /* storage unavailable — preference is not persisted */
  }
}
