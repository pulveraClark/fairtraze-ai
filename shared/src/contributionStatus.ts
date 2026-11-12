// The one-line "Contribution status" printed on the evidence reports. It is read from the members' flags
// ONLY (never from Gini or bands), so it is safe on the student sheet. Display only: nothing is scored here.

export function contributionStatus(members: ReadonlyArray<{ flags: readonly unknown[] }>): string {
  const flagged = members.filter((m) => m.flags.length > 0).length;
  return flagged === 0 ? "Fair" : `Needs review (${flagged} of ${members.length} flagged)`;
}
