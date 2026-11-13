import { describe, it, expect } from "vitest";
import { studentFlagLabel, studentFlagLabels, studentHealthLabel, AI_CARD_NOTE } from "./studentDisplay";

describe("studentDisplay (20, 21)", () => {
  it("shows free-rider and inactive as Low contribution, other flags unchanged", () => {
    expect(studentFlagLabel("free-rider")).toBe("Low contribution");
    expect(studentFlagLabel("inactive")).toBe("Low contribution");
    expect(studentFlagLabel("overload")).toBe("overload");
    expect(studentFlagLabel("deadline-driven")).toBe("deadline-driven");
  });

  it("does not repeat a label when two flags map to it", () => {
    expect(studentFlagLabels(["inactive", "free-rider", "overload"])).toEqual(["Low contribution", "overload"]);
  });

  it("uses plain words for the team health label and leaves unknown values alone", () => {
    expect(studentHealthLabel("even")).toBe("Work is evenly shared");
    expect(studentHealthLabel("a-bit-uneven")).toBe("Work is a bit uneven");
    expect(studentHealthLabel("very-uneven")).toBe("Work is very uneven");
    expect(studentHealthLabel("Something else")).toBe("Something else");
  });
});

describe("AI_CARD_NOTE", () => {
  it("is the one short note under the leader's AI parts and says nothing about generating", () => {
    expect(AI_CARD_NOTE).toBe("AI findings can be wrong and are not a grade.");
    expect(AI_CARD_NOTE).not.toMatch(/generate|gini|band|health/i);
  });
});
