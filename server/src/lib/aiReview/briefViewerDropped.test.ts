import { describe, it, expect } from "vitest";
import { shapeBriefForViewer } from "../../routes/aiReview.js";
import type { AiBriefContent } from "@shared/aiReviewTypes.js";

const content: AiBriefContent = {
  aiAddressedCount: 0,
  sources: { writtenBrief: true, filesRead: 0, skipped: [], droppedCount: 12 },
  requirements: [{ text: "Build a planner.", status: "FOUND", sourceQuote: "Build a planner.", evidence: [{ type: "file", ref: "a.ts", quote: "plan()" }] }],
};
const row = (c: unknown, status = "OK") => ({ status, content: c, promptVersion: "brief-3", briefHash: null, reportId: 1, createdAt: new Date() });
const current = { brief: "Build a planner.", latestReportId: 1 };

describe("droppedCount is for the instructor only", () => {
  it("the instructor receives it", () => {
    expect(shapeBriefForViewer(row(content), "instructor", 1, current)!.sources).toMatchObject({ droppedCount: 12 });
  });

  it("the leader's response has no droppedCount anywhere", () => {
    const view = shapeBriefForViewer(row(content), "leader", 1, current)!;
    expect(view.sources).toMatchObject({ writtenBrief: true, filesRead: 0 });
    expect(JSON.stringify(view)).not.toContain("droppedCount");
  });

  it("the nothing-read card does not leak it to the leader either", () => {
    const skipped = { requirements: [], sources: { writtenBrief: false, filesRead: 0, droppedCount: 3, skipped: [{ filename: "a.pdf", reason: "UNREADABLE" }] } };
    const view = shapeBriefForViewer(row(skipped, "SKIPPED"), "leader", 1, { brief: "", attachments: [{ id: 1, size: 5, mime: "application/pdf" }], latestReportId: 1 })!;
    expect(view.nothingRead).toBe(true);
    expect(JSON.stringify(view)).not.toContain("droppedCount");
  });

  it("a member gets no brief check at all", () => {
    expect(shapeBriefForViewer(row(content), "member", 1, current)).toBeNull();
  });
});
