import { describe, expect, it } from "vitest";
import { dedupeFlagsByLabel, flagLabel, flagLabels, flagReason, isLowContributionFlag, LOW_CONTRIBUTION_LABEL } from "./flagLabel";
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

  it("flagReason: inactive, default threshold, custom threshold, singular member, no threshold", () => {
    expect(flagReason("inactive", 4, null)).toBe("No recorded activity");
    expect(flagReason("free-rider", 4, { freeRider: 0.5 })).toBe("Below half of an equal share (12.5% for 4 members)");
    expect(flagReason("free-rider", 5, { freeRider: 0.9 })).toBe("Below 90% of an equal share (18% for 5 members)");
    expect(flagReason("free-rider", 1, { freeRider: 0.5 })).toBe("Below half of an equal share (50% for 1 member)");
    expect(flagReason("free-rider", 4, null)).toBeNull();
    expect(flagReason("overload", 4, { freeRider: 0.5 })).toBeNull();
  });

  it("dedupeFlagsByLabel keeps one pill, preferring inactive", () => {
    expect(dedupeFlagsByLabel(["free-rider", "inactive", "overload"])).toEqual(["inactive", "overload"]);
  });

  it("student and instructor wording agree for the low-contribution flags", () => {
    for (const k of ["free-rider", "inactive"] as const) {
      expect(FLAG_LABEL[k]).toBe(studentFlagLabel(k));
    }
  });
});

describe("printed flags use the same names", () => {
  it("flagsText prints Low contribution once, and None when empty", async () => {
    const { flagsText } = await import("./evidenceText");
    expect(flagsText(["free-rider", "deadline-driven"])).toBe("Low contribution, Deadline-driven");
    expect(flagsText(["inactive", "free-rider"])).toBe("Low contribution");
    expect(flagsText([])).toBe("None");
  });
});
