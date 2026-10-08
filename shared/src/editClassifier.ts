export const EDIT_TYPE_WEIGHT = {
  substantive: 1.0,
  revision:    0.7,
  formatting:  0.3,
  trivial:     0.1,
} as const;

export type EditType = keyof typeof EDIT_TYPE_WEIGHT;

export const TRIVIAL_MAX_CHARS     = 4;   // total chars (insert+delete) at/under this → trivial
export const SUBSTANTIVE_MIN_CHARS = 30;  // pure/expanded insertion at/over this → substantive
export const REPLACE_RATIO_MIN     = 0.5; // insert/delete length ratio band that reads as
export const REPLACE_RATIO_MAX     = 1.5; // "restructure at similar size" rather than a rewrite

export interface EditStats {
  insertLength: number; // chars inserted in this edit
  deleteLength: number; // chars deleted as part of the same edit (0 = pure insertion)
}

export function classifyEdit(stats: EditStats): EditType {
  const { insertLength, deleteLength } = stats;
  const total = insertLength + deleteLength;

  if (total <= TRIVIAL_MAX_CHARS) return "trivial";

  if (deleteLength === 0) {
    // Nothing removed — this is new material, not a rewrite of something existing.
    return insertLength >= SUBSTANTIVE_MIN_CHARS ? "substantive" : "revision";
  }

  const ratio = insertLength / deleteLength;
  if (ratio >= REPLACE_RATIO_MIN && ratio <= REPLACE_RATIO_MAX) return "formatting";

  return insertLength >= SUBSTANTIVE_MIN_CHARS ? "substantive" : "revision";
}
