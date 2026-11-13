// "Added in one go" hint for the instructor's member window. Plain counting from the edit log.
// Display only: this file is NOT imported by any scoring code and never changes a score, share,
// flag, Gini value or team-health label. It is a pointer ("please check the document history"),
// not a finding: an honest paste from Word or the member's own notes triggers it too.

/** One single insert of at least this many characters (about 250 words, half a page). */
export const ONE_GO_MIN_CHARS = 1500;
/** ...and that insert is at least this share of the member's retained text ("a large part"). */
export const ONE_GO_MIN_SHARE_OF_RETAINED = 0.6;
/** ...and the text survived: retained text is at least this share of the insert (a deleted paste does not count). */
export const ONE_GO_SURVIVED_SHARE = 0.5;

/** The member's largest single LIVE insert, and the Asia/Manila day (YYYY-MM-DD) it happened. */
export interface LargestInsert {
  length: number;
  day: string;
}

export function oneGoHintApplies(largestInsertChars: number, retainedChars: number): boolean {
  if (!(largestInsertChars >= ONE_GO_MIN_CHARS)) return false;
  if (!(retainedChars > 0)) return false;
  return (
    largestInsertChars >= ONE_GO_MIN_SHARE_OF_RETAINED * retainedChars &&
    retainedChars >= ONE_GO_SURVIVED_SHARE * largestInsertChars
  );
}
