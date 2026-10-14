import type { TeamReport, AnyScoredMember } from "@shared/types.js";

// Data minimization for the Gemini call (RA 10173). Real names and GitHub usernames never leave
// the server: members are sent as "Member A", "Member B", ... and the pseudonyms are swapped back
// in the returned narrative. Scores, flags and every number are untouched.

export interface PseudonymEntry {
  pseudonym:      string;
  studentName:    string;
  githubUsername: string;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// A, B, ... Z, AA, AB, ...
function labelFor(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Member ${out}`;
}

export function buildPseudonymEntries(members: ReadonlyArray<AnyScoredMember>): PseudonymEntry[] {
  return members.map((m, i) => ({
    pseudonym:      labelFor(i),
    studentName:    m.studentName,
    githubUsername: (m as { githubUsername?: string }).githubUsername ?? "",
  }));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replaces known names/usernames and any email address in free text (group name, assignment
// brief) with the matching pseudonym. Usernames under 3 characters are skipped in free text
// because a bare "a" would mangle ordinary words; they are already removed from structured data.
export function scrubFreeText(text: string, entries: ReadonlyArray<PseudonymEntry>): string {
  const lookup = new Map<string, string>();
  for (const e of entries) {
    if (e.studentName.trim().length >= 2) lookup.set(e.studentName.trim().toLowerCase(), e.pseudonym);
    if (e.githubUsername.trim().length >= 3) lookup.set(e.githubUsername.trim().toLowerCase(), e.pseudonym);
  }
  let out = text.replace(EMAIL_RE, "[email removed]");
  if (lookup.size === 0) return out;
  const alternatives = [...lookup.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`(?<![\\w])(?:${alternatives.join("|")})(?![\\w])`, "gi");
  out = out.replace(re, (hit) => lookup.get(hit.toLowerCase()) ?? hit);
  return out;
}

export function pseudonymizeReport(
  report: TeamReport<AnyScoredMember>,
  entries: ReadonlyArray<PseudonymEntry>,
): TeamReport<AnyScoredMember> {
  return {
    ...report,
    members: report.members.map((m, i) => {
      const copy = { ...m, studentName: entries[i]!.pseudonym } as AnyScoredMember;
      if ("githubUsername" in copy) (copy as { githubUsername: string }).githubUsername = "";
      return copy;
    }),
  };
}

// Single regex pass so a real name that happens to look like a pseudonym ("Member B") is never
// substituted twice.
export function restoreNames(text: string, entries: ReadonlyArray<PseudonymEntry>): string {
  const byLabel = new Map(entries.map((e) => [e.pseudonym, e.studentName]));
  return text.replace(/\bMember [A-Z]{1,2}\b/g, (hit) => byLabel.get(hit) ?? hit);
}
