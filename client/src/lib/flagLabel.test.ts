import { describe, expect, it } from "vitest";
import { flagLabel, flagLabels, isLowContributionFlag, LOW_CONTRIBUTION_LABEL } from "./flagLabel";
import { studentFlagLabel } from "./studentDisplay";
import { FLAG_LABEL } from "../components/ui/StatusPill";

describe("flagLabel (one name for every reader)", () => {
  it("free-rider and inactive both read Low contribution", () => {
    expect(LOW_CONTRIBUTION_LABEL).toBe("Low contribution");
    expect(flagLabel("free-rider")).toBe("Low contribution");
    expect(flagLabel("inactive")).toBe("Low contribution");
    expect(isLowContributionFlag("overload")).toBe(false);
  });

  it("keeps the other names and leaves unknown keys alone", () => {
    expect(flagLabel("overload")).toBe("Overload");
    expect(flagLabel("deadline-driven")).toBe("Deadline-driven");
    expect(flagLabel("something")).toBe("something");
  });

  it("does not repeat a label when both keys are present", () => {
    expect(flagLabels(["inactive", "free-rider", "overload"])).toEqual(["Low contribution", "Overload"]);
  });

  it("student and instructor wording agree for the low-contribution flags", () => {
    for (const k of ["free-rider", "inactive"] as const) {
      expect(FLAG_LABEL[k]).toBe(studentFlagLabel(k));
    }
  });
});
