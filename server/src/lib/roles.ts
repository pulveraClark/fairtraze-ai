// Default functional role(s) assigned to a new GroupMembership, based on the
// project's assignment sourceType. Context only — never affects scoring.
export function defaultFunctionalRoles(sourceType: string | null | undefined): string {
  if (sourceType === "EDITOR") return JSON.stringify(["DOCUMENTATION"]);
  // GITHUB and COMBINED both default to Developer; COMBINED members can
  // suggest/be assigned Documentation afterward.
  return JSON.stringify(["DEVELOPER"]);
}
