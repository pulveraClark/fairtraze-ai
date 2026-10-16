// A group's task key is the "FT" in "FT-12". Pure helpers; the SQL backfill in migration
// 20261018100000_task_board_fields uses the same rule (see test/taskBackfill.test.ts).

export const TASK_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,4}$/;
export const FALLBACK_TASK_KEY = "TASK";

/** Initials of the group name's words (letters/digits only), max 4; TASK when that is not a valid key. */
export function deriveTaskKey(groupName: string): string {
  const words = groupName.replace(/[^A-Za-z0-9 ]/g, "").split(/ +/).filter(Boolean);
  const initials = words.map((w) => w[0]!.toUpperCase()).join("").slice(0, 4);
  return TASK_KEY_PATTERN.test(initials) ? initials : FALLBACK_TASK_KEY;
}

/** The key to show: the stored one, or the one that will be stored when the first task is created. */
export function effectiveTaskKey(project: { taskKey: string | null; groupName: string }): string {
  return project.taskKey ?? deriveTaskKey(project.groupName);
}
