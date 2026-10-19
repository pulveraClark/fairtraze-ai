/** "1 group needs attention" / "4 groups need attention": one wording and correct grammar on every screen. */
export function groupsNeedAttention(count: number): string {
  return count === 1 ? "1 group needs attention" : `${count} groups need attention`;
}
