import { describe, expect, it } from "vitest";
import { flagNameForPrompt, flagWordsForInstructor as fw, LOW_CONTRIBUTION_LABEL, LOW_CONTRIBUTION_PHRASE } from "./flagWording";

describe("flagWordsForInstructor (display only)", () => {
  it("the stored definition sentence", () => {
    expect(fw("A free-rider flag means a member's total work contribution was very low."))
      .toBe("A low-contribution flag means a member's total work contribution was very low.");
  });

  it("articles", () => {
    expect(fw("Ben is a free-rider in this group.")).toBe("Ben is a low-contribution member in this group.");
    expect(fw("Cai is an inactive member of the team.")).toBe("Cai is a low-contribution member of the team.");
    expect(fw("An inactive member was found.")).toBe("A low-contribution member was found.");
  });

  it("plurals and -ing", () => {
    expect(fw("Two free-riders were noted.")).toBe("Two low-contribution members were noted.");
    expect(fw("There are free riders and inactive members.")).toBe("There are low-contribution members and low-contribution members.");
    expect(fw("The pattern looks like free-riding.")).toBe("The pattern looks like low contribution.");
  });

  it("the flag's own name", () => {
    expect(fw('Ana carries the "free-rider" flag.')).toBe('Ana carries the "low contribution" flag.');
    expect(fw("Flags: free-rider, overload")).toBe("Flags: low contribution, overload");
  });

  it("'no inactive members' becomes 'no low-contribution members'", () => {
    expect(fw("There are no inactive members in this group.")).toBe("There are no low-contribution members in this group.");
  });

  it("a bare 'inactive' that is not a flag phrase is left alone", () => {
    expect(fw("The repository was inactive over the break.")).toBe("The repository was inactive over the break.");
  });

  it("never touches numbers, names, percentages or other words", () => {
    const t = "Ana Cruz (46.2%) has 12 commits, a Gini of 0.122 and an overload flag; Ben holds 10%.";
    expect(fw(t)).toBe(t);
  });
});

describe("flag wording constants", () => {
  it("one label and one running-text phrase, same words", () => {
    expect(LOW_CONTRIBUTION_LABEL).toBe("Low contribution");
    expect(LOW_CONTRIBUTION_PHRASE).toBe(LOW_CONTRIBUTION_LABEL.toLowerCase());
  });
  it("the AI is told 'low contribution' once for both keys, other keys unchanged", () => {
    expect(flagNameForPrompt("free-rider")).toBe("low contribution");
    expect(flagNameForPrompt("inactive")).toBe("low contribution");
    expect(flagNameForPrompt("overload")).toBe("overload");
  });
});
