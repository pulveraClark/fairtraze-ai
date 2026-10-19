/**
 * Short labels for a group's members, aligned by index with `names`: "First L." (first name plus the
 * initial of the last word). People who would end up with the same label get their full name instead,
 * and identical full names get " (2)", " (3)"… so every label in one list is unique.
 */
export function shortMemberNames(names: string[]): string[] {
  const clean = names.map((n) => n.trim().replace(/\s+/g, " "));
  const short = clean.map((n) => {
    const parts = n.split(" ").filter(Boolean);
    if (parts.length <= 1) return parts[0] ?? "";
    const last = parts[parts.length - 1]!;
    return `${parts[0]} ${last[0]!.toUpperCase()}.`;
  });
  const count = new Map<string, number>();
  for (const s of short) count.set(s, (count.get(s) ?? 0) + 1);
  const full = clean.map((n, i) => ((count.get(short[i]!) ?? 0) > 1 ? n : short[i]!));
  const seen = new Map<string, number>();
  return full.map((label) => {
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return n === 1 ? label : `${label} (${n})`;
  });
}
