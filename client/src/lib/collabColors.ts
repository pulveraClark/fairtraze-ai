// Author colors for the Docs editor (authorship highlight, legend, presence chips, cursors,
// comment avatars). Display only: nothing here is read by scoring, capture or the server.
//
// Each slot has a full-strength MARKER color and an underline STYLE. The text highlight is the
// marker at TINT_ALPHA over the page plus a thin underline in the marker color, so authors are
// told apart by color AND by line style (never color alone). Markers are all at least 4.5:1
// against white (so a white initial on a chip is readable and the underline passes 3:1), and the
// first six differ clearly in hue and lightness. Blue and orange come first (colorblind-safe
// pairing). `collabColors.test.ts` measures all of this, including protan/deutan simulation.

// Tunable look. Change these after looking at the editor in the browser.
export const TINT_ALPHA = 0.35; // strength of the colored wash behind an author's text (0-1)
export const UNDERLINE_WIDTH_PX = 2; // thickness of the author underline
export type UnderlineStyle = "solid" | "dashed" | "dotted"; // wavy/double are avoided on purpose

interface AuthorSlot {
  name: string; // only for tests and tooltips of the palette itself
  marker: string;
  style: UnderlineStyle;
}

// Styles cycle solid, dashed, dotted by slot, so neighbours and the colorblind-weak pairs
// (orange/gold, teal/magenta, magenta/slate) never share a style.
const SLOTS: readonly AuthorSlot[] = [
  { name: "blue", marker: "#0072B2", style: "solid" },
  { name: "orange", marker: "#C75000", style: "dashed" },
  { name: "teal", marker: "#00806A", style: "dotted" },
  { name: "magenta", marker: "#A8467A", style: "solid" },
  { name: "violet", marker: "#5B3FA0", style: "dashed" },
  { name: "slate", marker: "#52606D", style: "dotted" },
  { name: "gold", marker: "#8C6D00", style: "solid" },
  { name: "rose", marker: "#B03A2E", style: "dashed" },
  { name: "sky", marker: "#1A72A3", style: "dotted" },
  { name: "olive", marker: "#5F7A00", style: "solid" },
];

export const AUTHOR_SLOTS = SLOTS;

// The single canonical place a group's roster is built for coloring purposes - every caller
// (DocumentEditor's awareness/cursor color, AuthorshipLegend, CommentPanel's Avatar,
// authorshipHighlight's buildDecorations) must be handed the SAME array, or they'll disagree on a
// member's color.
//
// Order is join order (joinedAt, then userId), so a member who joins later is appended and nobody
// already in the group changes color. `extraIds` are people who wrote text but are no longer
// members; they are appended after the members (by id) so they keep a color. Known limit: if an
// earlier member leaves, later members move up one slot (nothing is stored per member).
export function buildMemberRoster(
  members: { userId: number; joinedAt?: string | null }[],
  extraIds: number[] = []
): number[] {
  const time = (m: { joinedAt?: string | null }) => {
    const t = m.joinedAt ? Date.parse(m.joinedAt) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  const ordered = [...members].sort((a, b) => time(a) - time(b) || a.userId - b.userId).map((m) => m.userId);
  const seen = new Set(ordered);
  const extras = Array.from(new Set(extraIds)).filter((id) => !seen.has(id)).sort((a, b) => a - b);
  return [...ordered, ...extras];
}

// Two-letter uppercase initials for the legend swatches, in legend order. First letter of the first
// and last word; a single word gives its first two letters. If a later member would get initials an
// earlier one already has, they get the first two letters of their first name instead. Letters are
// taken by code point (Array.from) so an emoji is never split in half.
export function authorInitials(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    const first = (w: string) => Array.from(w)[0]!;
    const twoLetters = Array.from(words[0]!).slice(0, 2).join("").toUpperCase();
    const normal = (words.length > 1 ? first(words[0]!) + first(words[words.length - 1]!) : twoLetters).toUpperCase();
    const result = taken.has(normal) ? twoLetters : normal;
    taken.add(result);
    return result;
  });
}

function slotFor(userId: number, memberIds: number[]): AuthorSlot {
  const idx = memberIds.indexOf(userId);
  // Falls back to the raw id only for a userId absent from the roster.
  return SLOTS[(idx === -1 ? userId : idx) % SLOTS.length]!;
}

// Full-strength color: chips, cursors, avatars, legend, and the underline.
export function getUserColor(userId: number, memberIds: number[]): string {
  return slotFor(userId, memberIds).marker;
}

export function getUserUnderlineStyle(userId: number, memberIds: number[]): UnderlineStyle {
  return slotFor(userId, memberIds).style;
}

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

// The wash behind an author's text, as an rgba() string.
export function getUserTint(userId: number, memberIds: number[], alpha: number = TINT_ALPHA): string {
  const [r, g, b] = hexToRgb(slotFor(userId, memberIds).marker);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// The tint as an opaque color over white (what the eye sees on the page); used by tests.
export function tintOverWhite(marker: string, alpha: number = TINT_ALPHA): [number, number, number] {
  return hexToRgb(marker).map((c) => Math.round(c * alpha + 255 * (1 - alpha))) as [number, number, number];
}
