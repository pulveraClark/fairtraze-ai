import { describe, it, expect } from "vitest";
import { studentFlagLabel, studentFlagLabels, studentHealthLabel } from "./studentDisplay";

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
    expect(studentHealthLabel("Healthy")).toBe("Work is evenly shared");
    expect(studentHealthLabel("Moderate Risk")).toBe("Work is a bit uneven");
    expect(studentHealthLabel("High Risk")).toBe("Work is very uneven");
    expect(studentHealthLabel("Something else")).toBe("Something else");
  });
});
