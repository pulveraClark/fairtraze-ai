// The one rule for "the AI could not confirm this requirement", used by the client (which buttons to show)
// and the server (which marks to accept). Display/planning context only: never read by scoring.

export interface MarkableRequirement {
  status: "FOUND" | "PARTLY_FOUND" | "NOT_FOUND";
  unverified?: boolean;
}

/** A requirement may carry a "We have this" claim when the AI did not confirm it. One the AI marked covered may not. */
export function isMarkable(r: MarkableRequirement): boolean {
  return !!r.unverified || r.status !== "FOUND";
}

export const MARK_ALREADY_COVERED = "This item is already marked covered by the AI.";
export const MARK_ITEM_MISSING = "We could not find this item in the latest check. Please refresh the page.";
