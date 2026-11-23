import { describe, it, expect, vi } from "vitest";
import {
  IMAGE_CREDIT_CHARS, MIN_COUNTED_IMAGE_BYTES, MIN_COUNTED_IMAGE_SIDE_PX, DEFAULT_DOCS_IMAGE_LIMIT,
  isValidDocsImageLimit, resolveDocsImageLimit, countEligibleImages, applyImageLimit,
  type PresentDocumentImage,
} from "./imageCredit";
import { computeDocumentTeamReport } from "./documentScoring";
import type { RawDocumentMemberStats } from "./types";

const img = (hash: string, owner: number, over: Partial<PresentDocumentImage> = {}): PresentDocumentImage => ({
  contentHash: hash, ownerUserId: owner, byteSize: 50_000, width: 800, height: 600, ...over,
});

const member = (userId: number, over: Partial<RawDocumentMemberStats> = {}): RawDocumentMemberStats => ({
  studentName: `M${userId}`, userId, githubUsername: "",
  retainedChars: 1000, totalInsertedChars: 1000, totalDeletedChars: 0, selfDeletedChars: 0,
  sessionCount: 2, sessionDates: ["2026-01-01T02:00:00Z", "2026-01-02T02:00:00Z"],
  retainedCharsByDay: { "2026-01-01": 500, "2026-01-02": 500 },
  ...over,
});

describe("image limit setting", () => {
  it("allows only 3, 5, 10 and null", () => {
    for (const v of [3, 5, 10, null]) expect(isValidDocsImageLimit(v)).toBe(true);
    for (const v of [0, 4, 11, -1, "5", undefined, NaN]) expect(isValidDocsImageLimit(v)).toBe(false);
  });
  it("undefined reads as the default 5, null as no limit, invalid falls back with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveDocsImageLimit(undefined)).toBe(DEFAULT_DOCS_IMAGE_LIMIT);
    expect(DEFAULT_DOCS_IMAGE_LIMIT).toBe(5);
    expect(resolveDocsImageLimit(null)).toBeNull();
    expect(resolveDocsImageLimit(10)).toBe(10);
    expect(resolveDocsImageLimit(7)).toBe(5);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
  it("caps at the limit and does not cap with null", () => {
    expect(applyImageLimit(8, 5)).toBe(5);
    expect(applyImageLimit(2, 5)).toBe(2);
    expect(applyImageLimit(40, null)).toBe(40);
    expect(applyImageLimit(-3, 5)).toBe(0);
  });
});

describe("countEligibleImages", () => {
  it("counts big images per owner", () => {
    const m = countEligibleImages([img("a", 1), img("b", 1), img("c", 2)]);
    expect(m.get(1)).toBe(2);
    expect(m.get(2)).toBe(1);
  });
  it("counts the same content once (the first listed owner wins)", () => {
    const m = countEligibleImages([img("same", 1), img("same", 2)]);
    expect(m.get(1)).toBe(1);
    expect(m.get(2)).toBeUndefined();
  });
  it("never counts very small images (bytes or pixels) or unreadable sizes", () => {
    const m = countEligibleImages([
      img("tiny-bytes", 1, { byteSize: MIN_COUNTED_IMAGE_BYTES - 1 }),
      img("tiny-px", 1, { width: MIN_COUNTED_IMAGE_SIDE_PX - 1 }),
      img("thin", 1, { height: 40 }),
      img("unknown", 1, { width: 0, height: 0 }),
      img("edge", 1, { byteSize: MIN_COUNTED_IMAGE_BYTES, width: MIN_COUNTED_IMAGE_SIDE_PX, height: MIN_COUNTED_IMAGE_SIDE_PX }),
    ]);
    expect(m.get(1)).toBe(1);
  });
  it("an image that is no longer in the document is simply not in the list, so it earns nothing", () => {
    expect(countEligibleImages([]).size).toBe(0);
  });
});

describe("images in computeDocumentTeamReport", () => {
  it("adds IMAGE_CREDIT_CHARS per counted image to the retained-text term only", () => {
    const r = computeDocumentTeamReport([member(1, { countedImageCount: 2 }), member(2)]);
    const a = r.members[0];
    expect(a.effectiveRetainedChars).toBe(1000 + 2 * IMAGE_CREDIT_CHARS);
    expect(a.countedImageCount).toBe(2);
    expect(a.retainedTextShare).toBeGreaterThan(r.members[1].retainedTextShare);
  });

  it("stops after the project limit", () => {
    const m = [member(1, { countedImageCount: 8 })];
    expect(computeDocumentTeamReport(m, undefined, undefined, null, undefined, 3).members[0].countedImageCount).toBe(3);
    expect(computeDocumentTeamReport(m).members[0].countedImageCount).toBe(5);
    expect(computeDocumentTeamReport(m, undefined, undefined, null, undefined, 10).members[0].countedImageCount).toBe(8);
  });

  it("No limit counts every eligible image", () => {
    const r = computeDocumentTeamReport([member(1, { countedImageCount: 40 })], undefined, undefined, null, undefined, null);
    expect(r.members[0].countedImageCount).toBe(40);
    expect(r.members[0].effectiveRetainedChars).toBe(1000 + 40 * IMAGE_CREDIT_CHARS);
  });

  it("typed text is unchanged when there are no counted images", () => {
    const without = computeDocumentTeamReport([member(1), member(2)]);
    const zero = computeDocumentTeamReport([member(1, { countedImageCount: 0 }), member(2)]);
    expect(zero.members[0].effectiveRetainedChars).toBe(without.members[0].effectiveRetainedChars);
    expect(zero.members[0].contributionShare).toBe(without.members[0].contributionShare);
  });

  it("an image adds no session and no active day", () => {
    const a = computeDocumentTeamReport([member(1), member(2)]).members[0];
    const b = computeDocumentTeamReport([member(1, { countedImageCount: 5 }), member(2)]).members[0];
    expect(b.activeDays).toBe(a.activeDays);
    expect(b.sessionCount).toBe(a.sessionCount);
    expect(b.sessionShare).toBe(a.sessionShare);
    expect(b.activeDaysShare).toBe(a.activeDaysShare);
  });

  it("a member with only images and no typed text earns no active day", () => {
    const r = computeDocumentTeamReport([
      member(1, { retainedChars: 0, totalInsertedChars: 0, retainedCharsByDay: {}, countedImageCount: 5, sessionCount: 1, sessionDates: ["2026-01-01T02:00:00Z"] }),
      member(2),
    ]);
    expect(r.members[0].activeDays).toBe(0);
  });

  it("self-churn discount applies to typed text only, not to images", () => {
    const r = computeDocumentTeamReport([
      member(1, { selfDeletedChars: 1000, totalInsertedChars: 1000, countedImageCount: 1 }),
    ]);
    expect(r.members[0].effectiveRetainedChars).toBe(1000 * 0.5 + IMAGE_CREDIT_CHARS);
  });

  it("images do not change the sessions or active-days totals of other members", () => {
    const base = computeDocumentTeamReport([member(1), member(2)]);
    const withImg = computeDocumentTeamReport([member(1, { countedImageCount: 5 }), member(2)]);
    expect(withImg.members[1].sessionShare).toBe(base.members[1].sessionShare);
    expect(withImg.members[1].activeDaysShare).toBe(base.members[1].activeDaysShare);
  });
});
