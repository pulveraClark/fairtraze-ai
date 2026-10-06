// Fixed palette so each member gets a distinct, consistent cursor/presence color across
// sessions and reconnects — indexed by the member's position within their group's own member
// roster (memberIds), not by their raw global User.id. Indexing by the raw id would let two
// members in the same group collide on the identical color whenever their ids happen to be
// congruent mod PALETTE.length (a realistic occurrence once the app has more than a handful of
// accounts); a group-local index can't collide as long as the group has PALETTE.length members
// or fewer.
const PALETTE = [
  "#F87171", // red
  "#FB923C", // orange
  "#FBBF24", // amber
  "#A3E635", // lime
  "#34D399", // emerald
  "#22D3EE", // cyan
  "#60A5FA", // blue
  "#818CF8", // indigo
  "#C084FC", // purple
  "#F472B6", // pink
];

// The single canonical place a group's roster is built for coloring purposes — every caller
// (DocumentEditor's awareness/cursor color, AuthorshipLegend, CommentPanel's Avatar,
// authorshipHighlight's buildDecorations) must be handed the SAME array, sorted the same way,
// or they'll disagree on a member's color. DocumentEditor.tsx fetches the roster once per group
// and calls this; everything else receives that same array via state/props/refs — never builds
// its own copy.
export function buildMemberRoster(members: { userId: number }[]): number[] {
  return members.map((m) => m.userId).sort((a, b) => a - b);
}

// Colors are positional (a member's index in the sorted roster), not identity-pinned to their
// userId. This means a member's color is NOT stable across roster changes: if a member with a
// lower userId later joins the group, everyone already above them in the sorted order shifts
// one slot and is reassigned a different color than they had before. Accepted tradeoff of the
// group-local-index scheme (it trades long-term color stability for collision-freedom within a
// group) — not a bug.
export function getUserColor(userId: number, memberIds: number[]): string {
  const idx = memberIds.indexOf(userId);
  // Falls back to the raw id (old behavior) only for a userId absent from the roster — e.g. a
  // since-removed member whose earlier spans are still on record.
  return PALETTE[(idx === -1 ? userId : idx) % PALETTE.length]!;
}
