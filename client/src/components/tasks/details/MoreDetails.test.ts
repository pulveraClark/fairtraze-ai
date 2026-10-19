import { describe, it, expect } from "vitest";
import { hasMoreContent } from "./MoreDetails";
import { mkTask } from "../../../../test/taskFixtures";

const empty = { subtasks: [], attachments: [], commits: [] };

describe("hasMoreContent", () => {
  it("is false for a bare task, even though it always has watchers", () => {
    expect(hasMoreContent(mkTask({ id: 1 }), empty)).toBe(false);
  });
  it("is true when any extra field has content", () => {
    const t = mkTask({ id: 1 });
    expect(hasMoreContent({ ...t, labelIds: [3] }, empty)).toBe(true);
    expect(hasMoreContent({ ...t, milestoneId: 2 }, empty)).toBe(true);
    expect(hasMoreContent({ ...t, docHeading: "Intro" }, empty)).toBe(true);
    expect(hasMoreContent(t, { ...empty, subtasks: [{} as never] })).toBe(true);
    expect(hasMoreContent(t, { ...empty, attachments: [{} as never] })).toBe(true);
    expect(hasMoreContent(t, { ...empty, commits: [{} as never] })).toBe(true);
  });
});
