import { SOURCE_NAME, type SourceKey } from "./sourceColors";

export interface ShareBlend { wGitHub: number; wDocs: number }

export interface ShareSegment { key: SourceKey; pct: number }

export interface SplitShare {
  /** One segment per source that has weight; a source with weight 0 is left out. */
  segments: ShareSegment[];
  /** Sum of the segments, in points (0-100). Equals the member's combined share. */
  total: number;
  ariaLabel: string;
}

const usable = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** The blend weights if they can draw a split bar (finite, not negative, at least one above 0); otherwise null. Display only. */
export function validBlend(blend: Partial<ShareBlend> | null | undefined): ShareBlend | null {
  if (!blend || !usable(blend.wGitHub) || !usable(blend.wDocs) || blend.wGitHub + blend.wDocs <= 0) return null;
  return { wGitHub: blend.wGitHub, wDocs: blend.wDocs };
}

/**
 * Splits a Combined member's share into its GitHub and Docs parts using the public blend weights:
 * GitHub = wGitHub x GitHub share, Docs = wDocs x Docs share (shares are 0-1; a missing share counts as 0).
 * The parts add up to the combined share the scoring already computed. Nothing is recomputed or stored.
 */
export function splitShare(blend: ShareBlend, githubShare: number | null, docsShare: number | null): SplitShare {
  const parts: Record<SourceKey, number> = {
    github: blend.wGitHub * (githubShare ?? 0) * 100,
    docs: blend.wDocs * (docsShare ?? 0) * 100,
  };
  const active: SourceKey[] = [];
  if (blend.wGitHub > 0) active.push("github");
  if (blend.wDocs > 0) active.push("docs");
  const segments = active.map((key) => ({ key, pct: parts[key] }));
  const total = segments.reduce((sum, s) => sum + s.pct, 0);
  const named = segments.map((s) => `${SOURCE_NAME[s.key]} ${s.pct.toFixed(1)} points`).join(", ");
  return { segments, total, ariaLabel: `${named}, total ${total.toFixed(1)} percent` };
}
