import { describe, expect, it } from "vitest";
import { GITHUB_SAMPLE_NOTE, OUTSIDE_WORK_LINE, howCounted, selfDeletedChars } from "./howCounted";
import { ownCountedInput } from "./contributionStats";

const all = (m: ReturnType<typeof howCounted>) => [...m.blocks.flatMap((b) => [b.note ?? "", ...b.groups.flatMap((g) => g.items)]), ...m.footer].join("\n");

describe("howCounted", () => {
  it("GitHub-only member: three groups, one item per line, counts filled in, rules version and outside-work line last", () => {
    const m = howCounted({ voice: "member", github: { commentLines: 1200, blankLines: 340 }, docs: null, rulesVersion: 2 });
    expect(m.blocks.map((b) => b.source)).toEqual(["GitHub"]);
    expect(m.blocks[0].groups.map((g) => g.label)).toEqual(["Counts fully", "Counts less", "Does not count"]);
    expect(m.blocks[0].groups.map((g) => g.symbol)).toEqual(["✓", "↓", "✕"]);
    expect(m.blocks[0].groups.map((g) => g.tone)).toEqual(["full", "less", "none"]);
    expect(m.blocks[0].groups.every((g) => g.items.every((i) => !i.includes(". ")))).toBe(true);
    expect(all(m)).toContain("Comment lines count 25% (1,200 lines)");
    expect(all(m)).toContain("by up to 50%");
    expect(all(m)).toContain("Blank lines (340 lines)");
    expect(all(m)).toContain("Auto-generated files (for example lock files)");
    expect(all(m)).not.toMatch(/raw line totals|a quarter|build output/);
    expect(m.blocks[0].note).toBe(GITHUB_SAMPLE_NOTE);
    expect(GITHUB_SAMPLE_NOTE).toBe("Lines are counted from each member's 100 most recent commits. Commits and active days use the full history.");
    expect(m.footer).toEqual(["Scoring rules v2.", OUTSIDE_WORK_LINE]);
  });

  it("omits counts that are zero or unknown, and the rules line when the version is unknown", () => {
    const m = howCounted({ voice: "member", github: {}, docs: { images: 0, importedChars: 0 }, rulesVersion: null });
    expect(all(m)).not.toMatch(/\(\d[\d,]* (lines|characters)\)/);
    expect(all(m)).not.toContain("imported from a Word file");
    expect(m.footer).toEqual([OUTSIDE_WORK_LINE]);
  });

  it("Docs block derives self-deleted characters from the stored ratio", () => {
    expect(selfDeletedChars(0.25, 1000)).toBe(250);
    expect(selfDeletedChars(0, 1000)).toBe(0);
    const m = howCounted({
      voice: "member", github: null,
      docs: { selfChurnRatio: 0.25, totalInsertedChars: 1000, retainedChars: 700, importedChars: 400, images: 2 }, rulesVersion: 2,
    });
    expect(m.blocks.map((b) => b.source)).toEqual(["FairTraze Docs"]);
    const text = all(m);
    expect(text).toContain("still in the document (700 characters)");
    expect(text).toContain("(about 250 characters)");
    expect(text).toContain("Text imported from a Word file is counted by an estimate");
  });

  it("Docs wording: small wording and spacing edits are only under Counts less (with its real weights), Does not count names style changes, no 'trivial'/'.docx'", () => {
    const m = howCounted({ voice: "member", github: null, docs: { retainedChars: 10 }, rulesVersion: 2 });
    const [counted, less, not] = m.blocks[0].groups.map((g) => g.items.join("\n"));
    expect(less).toContain("Small wording and spacing edits count about 30%");
    expect(less).toContain("Tiny edits count about 10%");
    expect(not).toContain("Style changes that leave the text the same, such as bold or headings");
    expect(not).not.toMatch(/formatting/i);
    expect(counted).not.toMatch(/formatting/i);
    expect(all(m)).not.toMatch(/trivial|\.docx/i);
  });

  it("images: the same plain sentences for 0, 1 or many images, with no thresholds and no number of characters", () => {
    const groups = (images: number) => howCounted({ voice: "member", github: null, docs: { images }, rulesVersion: 3 }).blocks[0].groups;
    const text = (images: number) => groups(images).flatMap((g) => g.items).join("\n");
    for (const n of [0, 1, 12]) {
      expect(groups(n)[1].items).toContain("Images count a little, up to a limit your instructor sets");
      expect(groups(n)[2].items).toContain("Copies of the same image and very small images");
      expect(text(n)).not.toMatch(/not scored|never scored|\bKB\b|\bpx\b|pixel|100 characters|up to 5/);
    }
    expect(text(0)).toBe(text(12));
  });

  it("the real text has no 'here', no harness notes and no developer wording", () => {
    const full = all(howCounted({
      voice: "member", github: { commentLines: 300, blankLines: 100 },
      docs: { selfChurnRatio: 0.05, totalInsertedChars: 12000, retainedChars: 9000, importedChars: 1500, images: 2 }, rulesVersion: 2,
    }));
    expect(full).not.toMatch(/here|harness|fixture|TODO|undefined|NaN|\[object/i);
  });

  it("student voice addresses 'you' and never mentions the member, Gini or shares", () => {
    const m = howCounted({
      voice: "you", github: { commentLines: 5 },
      docs: { selfChurnRatio: 0.5, totalInsertedChars: 100, retainedChars: 40 }, rulesVersion: 2,
    });
    const text = all(m);
    expect(text).toContain("you");
    expect(text).not.toContain("the member");
    expect(text).not.toMatch(/gini|share|band|index/i);
  });

  it("Combined shows both sources", () => {
    const m = howCounted({ voice: "member", github: {}, docs: {}, rulesVersion: 2 });
    expect(m.blocks.map((b) => b.source)).toEqual(["GitHub", "FairTraze Docs"]);
  });
});

describe("ownCountedInput", () => {
  it("returns null without data and picks the right sources per assignment type", () => {
    expect(ownCountedInput(null, "GITHUB", 2)).toBeNull();
    const gh = ownCountedInput({ contributionShare: 0.5, commits: 1, additions: 1, deletions: 0, activeDays: 1, commentLinesAdded: 7, flags: [] }, "GITHUB", 2)!;
    expect(gh.docs).toBeNull();
    expect(gh.github).toEqual({ commentLines: 7, blankLines: undefined });
    const ed = ownCountedInput({ contributionShare: 0.5, sessionCount: 1, activeDays: 1, retainedChars: 10, totalInsertedChars: 20, flags: [] }, "EDITOR", 2)!;
    expect(ed.github).toBeNull();
    expect(ed.docs?.retainedChars).toBe(10);
    expect(ed.voice).toBe("you");
  });
});
