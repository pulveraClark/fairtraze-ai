import type { BoardMember } from "@shared/taskTypes";

// @mentions are stored as <@userId> tokens (comments and descriptions) and rendered live from the
// group's member list, so a renamed member shows their current name and a removed one shows
// "a former member". The server rejects tokens for anyone who is not in the group.

type Person = Pick<BoardMember, "userId" | "name">;

export type MentionPart =
  | { type: "text"; text: string }
  | { type: "mention"; userId: number; name: string; known: boolean };

export const FORMER_MEMBER = "a former member";

export function parseMentions(text: string, members: Person[]): MentionPart[] {
  const byId = new Map(members.map((m) => [m.userId, m.name]));
  const parts: MentionPart[] = [];
  let last = 0;
  for (const match of text.matchAll(/<@(\d+)>/g)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ type: "text", text: text.slice(last, at) });
    const userId = Number(match[1]);
    const name = byId.get(userId);
    parts.push({ type: "mention", userId, name: name ?? FORMER_MEMBER, known: name !== undefined });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}

/** Plain text with "@Name" in place of each token (used in the editor box and tests). */
export function mentionsToPlain(text: string, members: Person[]): string {
  return parseMentions(text, members).map((p) => (p.type === "text" ? p.text : p.known ? `@${p.name}` : p.name)).join("");
}

/** What the person is typing after an "@" right before the caret, or null when no mention is open. */
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null; // "me@host" is not a mention
  const query = before.slice(at + 1);
  if (/[\n<>]/.test(query) || query.length > 40) return null;
  return { start: at, query };
}

/** Members whose name contains the query (case-insensitive), prefix matches first. */
export function matchMembers<T extends Person>(members: T[], query: string, limit = 6): T[] {
  const q = query.trim().toLowerCase();
  return members
    .map((m) => ({ m, i: m.name.toLowerCase().indexOf(q) }))
    .filter((x) => q === "" || x.i >= 0)
    .sort((a, b) => (a.i === 0 ? 0 : 1) - (b.i === 0 ? 0 : 1) || a.m.name.localeCompare(b.m.name))
    .slice(0, limit)
    .map((x) => x.m);
}

