import { FORMER_MEMBER_NAME } from "@shared/privacyNotice.js";
import type { TeamReport, AnyScoredMember } from "@shared/types.js";

// Display-time names. Stored reports and the saved AI explanation keep the names members had when they were
// written. A response swaps in each member's CURRENT name, by member id. Display text only: nothing here is read
// by scoring, flags, Gini, team health, the narrative hash/basis or the Gemini prompt, and nothing is saved.

export interface CurrentPerson {
  name: string;
  githubUsername: string | null;
  deleted: boolean;
}

export interface StoredNameRef {
  userId: number;
  name: string;
}

const MIN_NAME_LENGTH = 2;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Old name -> current name, for the text swap. A member is skipped when the name did not change, the account is
 * gone or erased, either name is empty or the "Former member" placeholder, or the old (or the new) name is shared
 * by two members, so a swap can never land on the wrong person.
 */
export function buildNameMap(
  stored: ReadonlyArray<StoredNameRef>,
  current: ReadonlyMap<number, CurrentPerson>,
): Map<string, string> {
  const norm = (s: string) => s.trim().toLowerCase();
  const oldCount = new Map<string, number>();
  const newCount = new Map<string, number>();
  for (const s of stored) oldCount.set(norm(s.name), (oldCount.get(norm(s.name)) ?? 0) + 1);
  for (const p of current.values()) if (!p.deleted) newCount.set(norm(p.name), (newCount.get(norm(p.name)) ?? 0) + 1);

  const map = new Map<string, string>();
  for (const s of stored) {
    const person = current.get(s.userId);
    if (!person || person.deleted) continue;
    const oldName = s.name.trim();
    const newName = person.name.trim();
    if (oldName.length < MIN_NAME_LENGTH || newName.length < MIN_NAME_LENGTH) continue;
    if (oldName === FORMER_MEMBER_NAME || newName === FORMER_MEMBER_NAME) continue;
    if (oldName === newName) continue;
    if ((oldCount.get(norm(oldName)) ?? 0) > 1) continue;
    if ((newCount.get(norm(newName)) ?? 0) > 1) continue;
    map.set(oldName, newName);
  }
  return map;
}

/** One pass, whole words only, longest name first. A replacement is never searched again. */
export function swapNames(text: string, map: ReadonlyMap<string, string>): string {
  if (!text || map.size === 0) return text;
  const lookup = new Map<string, string>();
  for (const [oldName, newName] of map) lookup.set(oldName.toLowerCase(), newName);
  const alternatives = [...lookup.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}_])`, "giu");
  return text.replace(re, (hit) => lookup.get(hit.toLowerCase()) ?? hit);
}

/** Member id of a stored report member: its userId, else the group member with the same GitHub login. */
export function resolveUserId(
  m: { userId?: number; githubUsername?: string },
  current: ReadonlyMap<number, CurrentPerson>,
): number | null {
  if (typeof m.userId === "number") return m.userId;
  const login = (m.githubUsername ?? "").trim().toLowerCase();
  if (!login) return null;
  for (const [id, p] of current) if ((p.githubUsername ?? "").trim().toLowerCase() === login) return id;
  return null;
}

/** The names a stored report holds, as {userId, name}; members that cannot be tied to an account are left out. */
export function storedNameRefs(
  report: { members?: ReadonlyArray<{ userId?: number; githubUsername?: string; studentName?: string }> } | null | undefined,
  current: ReadonlyMap<number, CurrentPerson>,
): StoredNameRef[] {
  const out: StoredNameRef[] = [];
  for (const m of report?.members ?? []) {
    const id = resolveUserId(m, current);
    if (id !== null && m.studentName) out.push({ userId: id, name: m.studentName });
  }
  return out;
}

/** A copy of the report with each live member's current name. The stored object is never changed. */
export function withCurrentNames<R extends TeamReport<AnyScoredMember>>(
  report: R,
  current: ReadonlyMap<number, CurrentPerson>,
): R {
  return {
    ...report,
    members: report.members.map((m) => {
      const id = resolveUserId(m as { userId?: number; githubUsername?: string }, current);
      const person = id === null ? undefined : current.get(id);
      if (!person || person.deleted || person.name.trim().length < MIN_NAME_LENGTH || person.name === FORMER_MEMBER_NAME) return m;
      return { ...m, studentName: person.name } as AnyScoredMember;
    }),
  };
}
