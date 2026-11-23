import { describe, it, expect } from "vitest";
import { lockReason } from "./permissionText";

const member = { userId: 2, isLeader: false, isMember: true, readOnly: false, canCreate: true, canManageBoard: false };
const viewOnly = { ...member, readOnly: true, isMember: false, canCreate: false };

describe("lockReason names who can do it", () => {
  it("leader-only actions", () => {
    expect(lockReason("assign", { status: "TODO" }, member)).toBe("Only the group leader can do this.");
    expect(lockReason("delete", { status: "TODO" }, member)).toBe("Only the group leader can do this.");
  });

  it("assignee-or-leader actions, with a Done-specific wording", () => {
    expect(lockReason("edit", { status: "TODO" }, member)).toBe("Only the assigned member or the group leader can change this.");
    expect(lockReason("setDue", { status: "DONE" }, member)).toBe("This task is Done, so only the group leader can change it.");
    expect(lockReason("move", { status: "DONE" }, member)).toBe("Only the group leader can move a task out of Done.");
  });

  it("instructors and admins always get the view-only explanation", () => {
    for (const kind of ["edit", "assign", "comment", "watch", "delete", "move"] as const) {
      expect(lockReason(kind, { status: "TODO" }, viewOnly)).toBe("Instructors and admins have view-only access to tasks.");
    }
  });
});
