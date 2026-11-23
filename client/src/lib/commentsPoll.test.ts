import { describe, expect, it } from "vitest";
import { newCommentCount, newCommentsText, openThreadCount, sameComments } from "./commentsPoll";

const c = (id: number, extra: Partial<{ parentId: number | null; resolvedAt: string | null; text: string }> = {}) => ({
  id,
  parentId: null,
  resolvedAt: null,
  text: "t",
  ...extra,
});

describe("commentsPoll", () => {
  it("treats identical lists as the same and detects changes", () => {
    expect(sameComments([c(1), c(2)], [c(1), c(2)])).toBe(true);
    expect(sameComments([c(1)], [c(1), c(2)])).toBe(false);
    expect(sameComments([c(1)], [c(1, { resolvedAt: "2026-11-13" })])).toBe(false);
    expect(sameComments([c(1)], [c(1, { text: "edited" })])).toBe(false);
  });

  it("counts only open top-level threads", () => {
    expect(openThreadCount([c(1), c(2, { resolvedAt: "x" }), c(3, { parentId: 1 })])).toBe(1);
    expect(openThreadCount([])).toBe(0);
  });

  it("counts comments not seen before", () => {
    expect(newCommentCount([c(1)], [c(1), c(2), c(3)])).toBe(2);
    expect(newCommentCount([c(1)], [c(1)])).toBe(0);
  });

  it("words the notice", () => {
    expect(newCommentsText(1)).toBe("1 new comment");
    expect(newCommentsText(3)).toBe("3 new comments");
  });
});
