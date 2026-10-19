/** "3 of 8 done", or "No tasks" when the group has none. Planning counts only; never a score. */
export function taskCountLabel(done: number, total: number): string {
  return total === 0 ? "No tasks" : `${done} of ${total} done`;
}
