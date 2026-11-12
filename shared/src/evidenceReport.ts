// Contribution Evidence Report: the small, whitelisted payload behind the one-page printout and the
// instructor's "Verify report" box. Types and constants only. Nothing here scores anything: every
// number is read from a stored analysis. Display and verification only.
import type { Flag } from "./types.js";

export const EVIDENCE_UNIVERSITY_NAME = "University of Cebu – Lapu-Lapu and Mandaue";

// Report ID: "FT-" + 4 characters + "-" + 2 characters from an alphabet without look-alikes (no 0/O/1/I/L).
export const REPORT_ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REPORT_ID_PATTERN = /^FT-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{2}$/;

/** Normalises what a person typed: trims, upper-cases, turns spaces/underscores into nothing around the dashes. */
export function normalizeReportIdInput(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = compact.length === 8 && compact.startsWith("FT") ? compact.slice(2) : compact;
  if (body.length !== 6) return raw.trim().toUpperCase();
  return `FT-${body.slice(0, 4)}-${body.slice(4)}`;
}

export interface EvidenceMemberRow {
  name: string;
  /** Percent of the group's GitHub work; null when GitHub is not a source of this assignment. */
  githubPct: number | null;
  /** Percent of the group's document work; null when the editor is not a source of this assignment. */
  docsPct: number | null;
  combinedPct: number;
  flags: Flag[];
}

export interface EvidenceReportDto {
  collegeName: string;
  groupName: string;
  className: string;
  projectTitle: string;
  repoUrl: string | null;
  analyzedAt: string;
  generatedAt: string;
  sourceType: "GITHUB" | "EDITOR" | "COMBINED";
  /** Whole percents, only for COMBINED. */
  weights: { githubPct: number; docsPct: number } | null;
  memberCount: number;
  equalSharePct: number;
  members: EvidenceMemberRow[];
  leaderName: string | null;
  reportId: string;
}

export type EvidenceVerifyStatus = "latest" | "older";

export interface EvidenceVerifyResult {
  status: EvidenceVerifyStatus;
  report: EvidenceReportDto;
}
