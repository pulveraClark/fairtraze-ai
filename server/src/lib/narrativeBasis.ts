import { createHash } from "node:crypto";

// Which analysis an AI explanation was written for. The explanation is stored inside the Report row and
// carried to each newer report unchanged (automatic runs never call Gemini), so after a re-analysis it can
// sit beside numbers it was not written from. This fingerprint covers only the numbers the text talks
// about (team-health label, Gini, each member's share and flags), not the prompt or model, so a deploy
// never marks every explanation out of date. Display only: it is never read by scoring, flags, Gini or
// team health, and it never changes the text.

interface BasisReport {
  teamHealth?: string;
  gini?: number;
  memberCount?: number;
  members?: Array<{ userId?: number; githubUsername?: string; studentName?: string; contributionShare?: number; flags?: string[] }>;
}

export function narrativeBasisOf(report: BasisReport): string {
  const members = (report.members ?? [])
    .map((m) => [
      String(m.userId ?? m.githubUsername ?? m.studentName ?? "?"),
      Math.round((m.contributionShare ?? 0) * 10000),
      [...(m.flags ?? [])].sort().join("+"),
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const payload = [report.teamHealth ?? "", Math.round((report.gini ?? 0) * 1000), report.memberCount ?? members.length, members];
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}

interface StoredForBasis {
  report?: BasisReport;
  narrative?: string | null;
  narrativeOutdated?: boolean;
  narrativeBasis?: string;
}

/**
 * True when the saved explanation was not written for the numbers shown now: the stored flag is set, or its
 * recorded basis differs from this report's. An explanation saved before the basis was recorded can only rely
 * on the stored flag (set when a later analysis changes the results), and gets a basis the next time it is
 * generated.
 */
export function isNarrativeOutdated(stored: StoredForBasis): boolean {
  if (!stored.narrative) return false;
  if (stored.narrativeOutdated === true) return true;
  if (!stored.narrativeBasis || !stored.report) return false;
  return stored.narrativeBasis !== narrativeBasisOf(stored.report);
}
