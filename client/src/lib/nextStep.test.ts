import { describe, it, expect } from "vitest";
import { nextStepText, taskNextStep } from "./nextStep";

const TODAY = "2026-10-20"; // a Tuesday
const t = (dueDate: string | null, over: Partial<{ assignedToUserId: number | null; status: string }> = {}) => ({
  assignedToUserId: 1, status: "TODO", dueDate, ...over,
});

describe("taskNextStep", () => {
  it("names the day and the count of the soonest due tasks", () => {
    expect(taskNextStep([t("2026-10-23"), t("2026-10-23"), t("2026-10-25")], 1, TODAY)).toBe("You have 2 tasks due Friday");
  });
  it("says today and tomorrow in words", () => {
    expect(taskNextStep([t("2026-10-20")], 1, TODAY)).toBe("You have 1 task due today");
    expect(taskNextStep([t("2026-10-21")], 1, TODAY)).toBe("You have 1 task due tomorrow");
  });
  it("overdue comes first", () => {
    expect(taskNextStep([t("2026-10-18"), t("2026-10-21")], 1, TODAY)).toBe("You have 1 overdue task");
    expect(taskNextStep([t("2026-10-18"), t("2026-10-19")], 1, TODAY)).toBe("You have 2 overdue tasks");
  });
  it("counts only my own open tasks", () => {
    expect(taskNextStep([t("2026-10-21", { assignedToUserId: 2 }), t("2026-10-21", { status: "DONE" })], 1, TODAY)).toBeNull();
  });
  it("is quiet when nothing is due soon, there is no date, or tasks are far off", () => {
    expect(taskNextStep([], 1, TODAY)).toBeNull();
    expect(taskNextStep([t(null)], 1, TODAY)).toBeNull();
    expect(taskNextStep([t("2026-11-30")], 1, TODAY)).toBeNull();
    expect(taskNextStep([t("2026-10-21")], null, TODAY)).toBeNull();
  });
});

describe("nextStepText", () => {
  it("is the task line when there is one", () => {
    expect(nextStepText({ tasks: [t("2026-10-23")], userId: 1, today: TODAY })).toBe("You have 1 task due Friday");
  });
  it("is null when there is nothing to say (no All set text any more)", () => {
    expect(nextStepText({ tasks: [], userId: 1, today: TODAY })).toBeNull();
  });
});
