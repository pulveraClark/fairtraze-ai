import { describe, it, expect } from "vitest";
import { studentNarrative, stripShareClauses, studentFlagWords } from "../src/lib/studentNarrative.js";

// Pure functions, no database. Sentences are the shapes seen in the Route Team Bang demo.
const BAD_WORDS = /free[\s-]?rider|gini|\bband\b|team health|moderate risk|high risk|!|%/i;

describe("studentNarrative: names, percentages and flag words", () => {
  it("drops an orphan 'They' sentence whose owner sentence was removed", () => {
    const text = "Christian Lenizo has a 12.5% contribution share and is far above the team's Gini of 0.31. They made 2 commits and had 1 docs session.";
    const out = studentNarrative(text)!;
    expect(out ?? "").not.toMatch(/\bThey\b/);
  });

  it("the demo order: a paragraph that starts with 'They' loses it, the named sentence stays", () => {
    const text = "They made 2 commits and had 1 docs session. Christian Lenizo was flagged for overload.";
    expect(studentNarrative(text)).toBe("Christian Lenizo was flagged for overload.");
  });

  it("keeps the named sentence and cuts the share clause, so the pronoun sentence after it keeps its owner", () => {
    const text = "Christian Lenizo, with a contribution share of 12.5%, was flagged for overload. They made 2 commits and had 1 docs session.";
    expect(studentNarrative(text)).toBe("Christian Lenizo was flagged for overload. They made 2 commits and had 1 docs session.");
  });

  it("'free-rider' becomes 'low contribution'", () => {
    expect(studentNarrative("Aldren Baricuatro was flagged as a free-rider.")).toBe("Aldren Baricuatro was flagged for low contribution.");
    expect(studentNarrative("Two members are free-riders.")).toBe("Two members are low contribution.");
    expect(studentFlagWords("The Free Rider flag")).toBe("The low contribution flag");
    expect(studentFlagWords("Mia was inactive.")).toBe("Mia was low contribution.");
  });

  it("'overload' stays as it is", () => {
    expect(studentNarrative("Christian Lenizo was flagged for overload.")).toBe("Christian Lenizo was flagged for overload.");
  });

  it("never leaves a percentage, even when the clause cannot be cut cleanly", () => {
    const out = studentNarrative("Aldren Baricuatro contributed 6.2% of the work. Kient wrote the API.");
    expect(out).toBe("Kient wrote the API.");
    expect(stripShareClauses("Ana (12.5%) wrote the API.")).toBe("Ana wrote the API.");
  });

  it("a whole Route Team Bang paragraph: every sentence has its person, no percentage, no free-rider", () => {
    const text = [
      "Route Team Bang is the project. The team is Healthy overall.",
      "Christian Lenizo, with a contribution share of 41.3%, was flagged for overload. They made 2 commits and had 1 docs session.",
      "Aldren Baricuatro, with a contribution share of 6.2%, was flagged as a free-rider. He made 1 commit.",
      "The Gini coefficient is 0.31, so the work is spread very evenly.",
    ].join("\n\n");
    const out = studentNarrative(text)!;
    expect(out).not.toMatch(BAD_WORDS);
    expect(out).toContain("Christian Lenizo was flagged for overload.");
    expect(out).toContain("Aldren Baricuatro was flagged for low contribution.");
    expect(out).toContain("They made 2 commits and had 1 docs session.");
  });

  it("names a flagged person again when the AI text lost the sentence that named them", () => {
    const out = studentNarrative("Kient wrote the API.", [
      { name: "Aldren Baricuatro", flags: ["free-rider"] },
      { name: "Christian Lenizo", flags: ["overload"] },
      { name: "Kient Cruz", flags: [] },
    ])!;
    expect(out).toBe("Kient wrote the API.\n\nAldren Baricuatro was flagged for low contribution. Christian Lenizo was flagged for overload.");
    expect(out).not.toMatch(BAD_WORDS);
  });

  it("does not repeat a person the text already names", () => {
    const out = studentNarrative("Christian Lenizo was flagged for overload.", [{ name: "Christian Lenizo", flags: ["overload"] }]);
    expect(out).toBe("Christian Lenizo was flagged for overload.");
  });

  it("does not repeat a person the text names by first name only, in any letter case", () => {
    const people = [{ name: "Christian Lenizo", flags: ["overload"] }];
    expect(studentNarrative("Christian was flagged for overload.", people)).toBe("Christian was flagged for overload.");
    expect(studentNarrative("CHRISTIAN made 2 commits.", people)).toBe("CHRISTIAN made 2 commits.");
    // A different name that only starts with the same letters is not the same person.
    expect(studentNarrative("Christiana made 2 commits.", people)).toContain("Christian Lenizo was flagged for overload.");
  });

  it("Gini and health sentences are still dropped, and nothing left gives null", () => {
    expect(studentNarrative("The Gini coefficient is 0.31. Moderate Risk team health.")).toBeNull();
    expect(studentNarrative(null)).toBeNull();
  });
});
