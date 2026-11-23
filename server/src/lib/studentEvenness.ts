// What a student (or a group leader) is told about how evenly work is shared. The stored team-health
// label (and Gini) never reaches a student; the server derives this plain token from it and sends
// only the token. Display only: nothing here feeds scoring, flags, Gini or the label itself.

export type Evenness = "even" | "a-bit-uneven" | "very-uneven";

export function evennessOf(teamHealth: string | null | undefined): Evenness | null {
  if (teamHealth === "Healthy") return "even";
  if (teamHealth === "Moderate Risk") return "a-bit-uneven";
  if (teamHealth === "High Risk") return "very-uneven";
  return null;
}
