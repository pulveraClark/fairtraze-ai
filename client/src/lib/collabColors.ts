// Fixed palette so each member gets a distinct, consistent cursor/presence color
// across sessions and reconnects (indexed deterministically by their user id).
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

export function getUserColor(userId: number): string {
  return PALETTE[userId % PALETTE.length]!;
}
