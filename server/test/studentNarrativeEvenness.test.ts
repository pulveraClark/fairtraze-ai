import { describe, it, expect } from "vitest";
import { studentNarrative, stripTeamMeasures, isEvennessSentence } from "../src/lib/studentNarrative.js";

// Pure functions, no database.
describe("studentNarrative: evenness sentences", () => {
  const evenness = [
    "Contribution was spread evenly across the group.",
    "Work is spread very evenly.",
    "The work was shared fairly between members.",
    "Tasks were evenly distributed.",
    "This shows a balanced contribution from everyone.",
    "This value shows that contribution was spread very evenly.",
    "This figure suggests the effort was equal.",
    "The workload looks balanced.",
    "Participation was fairly unequal.",
    "The evenness is high.",
  ];

  it.each(evenness)("drops: %s", (sentence) => {
    expect(isEvennessSentence(sentence)).toBe(true);
    expect(studentNarrative(`Alice wrote the API. ${sentence} Bob wrote the docs.`)).toBe("Alice wrote the API. Bob wrote the docs.");
  });

  it("keeps ordinary sentences, including ones with similar words", () => {
    for (const ok of [
      "Alice wrote the API.",
      "Bob shared the API docs with the team.",
      "Carla split the module into three files.",
      "The even-numbered tests were fixed.",
      "Dan fairly summarised the report.",
    ]) {
      expect(isEvennessSentence(ok), ok).toBe(false);
      expect(studentNarrative(ok)).toBe(ok);
    }
  });

  it("returns null when every sentence is removed, never an empty or half sentence", () => {
    expect(studentNarrative("This value shows that contribution was spread very evenly.")).toBeNull();
    expect(studentNarrative("Work was shared fairly.\n\nContribution was balanced contribution.")).toBeNull();
    expect(studentNarrative("The Gini coefficient is 0.3. Work was spread evenly.")).toBeNull();
    expect(studentNarrative(null)).toBeNull();
  });

  it("Gini, band and health words stay blocked as before", () => {
    for (const bad of ["The Gini coefficient is 0.31.", "The team is in the 0.4 band.", "The team health is Healthy.", "A Moderate Risk group."]) {
      expect(studentNarrative(`Alice wrote the API. ${bad}`), bad).toBe("Alice wrote the API.");
    }
  });

  it("does not touch member summaries or the instructor text", () => {
    const summary = "Ana spread her commits evenly across the week.";
    expect(stripTeamMeasures(summary)).toBe(summary);
  });
});
