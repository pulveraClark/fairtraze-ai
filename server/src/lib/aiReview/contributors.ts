import type { AuthorshipSpan } from "../../collab/authorshipMap.js";
import type { DocPiece } from "./docsEvidence.js";

// "Worked on by" under each requirement of the project instructions check (instructor and leader only).
// Contributors are the members who wrote the VERIFIED proof shown for the requirement: Docs authors and the
// authors of the commits that touched a shown file. Display only: nothing here is read by scoring, flags, Gini
// or the AI. Names come out as "First L." and are sorted by name (never by amount), so the order cannot read as
// a ranking. An author who cannot be matched to a member is left out; a raw login or email is never returned.

export interface ContributorEvidence {
  type: "file" | "doc";
  ref: string;
  commits?: string[];
  authors?: number[];
  heading?: boolean;
}

export interface ContributorLookup {
  /** userId -> full display name, for the current members only. */
  names: Map<number, string>;
  /** lower-cased GitHub username -> userId, for the current members only. */
  userByLogin: Map<string, number>;
  /** commit sha -> commit author login (AiCommitDigest). */
  loginBySha: Map<string, string>;
  /** Docs heading -> user ids who wrote under it. Needed only for heading-only proof. */
  headingAuthors?: (heading: string) => number[];
}

/** "Aldren Bautista" -> "Aldren B."; a single word stays as it is. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${[...parts[parts.length - 1]!][0]!.toUpperCase()}.`;
}

/** Every sha mentioned by the file evidence of these requirements (to load their authors in one query). */
export function evidenceShas(requirements: Array<{ evidence: ContributorEvidence[] }>): string[] {
  return [...new Set(requirements.flatMap((r) => r.evidence.flatMap((e) => (e.type === "file" ? e.commits ?? [] : []))))];
}

export function hasHeadingProof(requirements: Array<{ evidence: ContributorEvidence[] }>): boolean {
  return requirements.some((r) => r.evidence.some((e) => e.type === "doc" && e.heading));
}

/**
 * Who wrote under a heading. The document's first heading is taken to be its title, so proof on it means the
 * whole document and every author counts. (The pieces carry no heading level, so a document whose first heading
 * is a real section is treated the same way; two headings with the same text count as one section.)
 */
export function headingAuthorIds(heading: string, pieces: DocPiece[], spans: AuthorshipSpan[]): number[] {
  const first = pieces.find((p) => p.isHeading && p.text.trim() !== "");
  if (first && first.text.trim() === heading) return [...new Set(spans.map((s) => s.userId))];
  const section = pieces.filter((p) => p.heading === heading);
  return [...new Set(section.flatMap((p) => spans.filter((s) => s.start < p.end && s.end > p.start).map((s) => s.userId)))];
}

export function contributorsFor(evidence: ContributorEvidence[], lookup: ContributorLookup): string[] {
  const ids = new Set<number>();
  for (const e of evidence) {
    if (e.type === "file") {
      for (const sha of e.commits ?? []) {
        const login = lookup.loginBySha.get(sha);
        const id = login ? lookup.userByLogin.get(login.toLowerCase()) : undefined;
        if (id !== undefined) ids.add(id);
      }
    } else {
      const authors = e.heading ? lookup.headingAuthors?.(e.ref) ?? [] : e.authors ?? [];
      for (const id of authors) ids.add(id);
    }
  }
  const full = [...ids].map((id) => lookup.names.get(id)?.trim()).filter((n): n is string => !!n);
  // Two members who shorten to the same "First L." show their full names (only those two); the rest stay short.
  const counts = new Map<string, number>();
  for (const n of full) counts.set(shortName(n), (counts.get(shortName(n)) ?? 0) + 1);
  return full.map((n) => ((counts.get(shortName(n)) ?? 0) > 1 ? n : shortName(n))).sort((a, b) => a.localeCompare(b));
}
