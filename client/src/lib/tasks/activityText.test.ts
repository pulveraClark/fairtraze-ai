import { describe, it, expect } from "vitest";
import type { TaskActivityEntry } from "@shared/taskTypes";
import { describeActivity, formatWhen } from "./activityText";

const board = {
  members: [
    { userId: 1, name: "Leader Lee", avatarUpdatedAt: null, role: "LEADER" as const, functionalRoles: [] },
    { userId: 3, name: "Ana Reyes", avatarUpdatedAt: null, role: "MEMBER" as const, functionalRoles: [] },
  ],
  milestones: [{ id: 5, name: "Alpha release", dueDate: null, position: 1, total: 0, done: 0 }],
  labels: [{ id: 10, name: "frontend", color: "blue" as const }, { id: 11, name: "docs", color: "green" as const }],
};

const entry = (type: TaskActivityEntry["type"], actorId: number | null, data: TaskActivityEntry["data"] = null): TaskActivityEntry =>
  ({ id: 1, actorId, type, data, createdAt: "2026-10-15T02:40:00.000Z" });

describe("describeActivity: plain language, names looked up live", () => {
  it("status moves", () => {
    expect(describeActivity(entry("status_changed", 3, { from: "TODO", to: "IN_PROGRESS" }), board))
      .toBe("Ana Reyes moved it from To do to In progress");
  });

  it("assignment and unassignment", () => {
    expect(describeActivity(entry("assigned", 1, { to: 3 }), board)).toBe("Leader Lee assigned it to Ana Reyes");
    expect(describeActivity(entry("unassigned", 1, { from: 3 }), board)).toBe("Leader Lee unassigned it from Ana Reyes");
  });

  it("a removed member reads 'a former member', never a raw id", () => {
    expect(describeActivity(entry("assigned", 1, { to: 99 }), board)).toBe("Leader Lee assigned it to a former member");
    expect(describeActivity(entry("comment_added", 99), board)).toBe("A former member commented");
    expect(describeActivity(entry("created", null), board)).toBe("Someone created this task");
  });

  it("priority, due dates, milestone and labels", () => {
    expect(describeActivity(entry("priority_changed", 1, { from: "LOW", to: "HIGH" }), board)).toBe("Leader Lee changed the priority from low to high");
    expect(describeActivity(entry("due_changed", 1, { from: null, to: "2026-11-14" }), board)).toMatch(/^Leader Lee set the due date to Nov 14/);
    expect(describeActivity(entry("due_changed", 1, { from: "2026-11-14", to: null }), board)).toBe("Leader Lee removed the due date");
    expect(describeActivity(entry("milestone_changed", 1, { from: null, to: 5 }), board)).toBe('Leader Lee added it to the milestone "Alpha release"');
    expect(describeActivity(entry("milestone_changed", 1, { from: 5, to: null }), board)).toBe("Leader Lee removed it from its milestone");
    expect(describeActivity(entry("labels_changed", 1, { from: [10], to: [11, 12] }), board)).toBe("Leader Lee added docs, a removed label and removed frontend");
  });

  it("subtasks, attachments and unknown types", () => {
    expect(describeActivity(entry("subtask_done", 3, { title: "Draft intro" }), board)).toBe('Ana Reyes completed the subtask "Draft intro"');
    expect(describeActivity(entry("attachment_added", 3, { filename: "plan.pdf" }), board)).toBe("Ana Reyes attached plan.pdf");
    expect(describeActivity(entry("something_new" as never, 3), board)).toBe("Ana Reyes updated this task");
  });
});

describe("formatWhen", () => {
  it("uses the school's time zone (Asia/Manila)", () => {
    expect(formatWhen("2026-10-15T02:40:00.000Z")).toBe("Oct 15, 10:40 AM");
  });
});
