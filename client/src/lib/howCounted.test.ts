import { describe, expect, it } from "vitest";
import { OUTSIDE_WORK_LINE, howCounted, selfDeletedChars } from "./howCounted";
import { ownCountedInput } from "./contributionStats";

const all = (m: ReturnType<typeof howCounted>) => [...m.blocks.flatMap((b) => b.groups.map((g) => g.text)), ...m.footer].join(" ");

describe("howCounted", () => {
  it("GitHub-only member: three groups, counts filled in, rules version and outside-work line last", () => {
    const m = howCounted({ voice: "member", github: { commentLines: 1200, blankLines: 340 }, docs: null, rulesVersion: 2 });
    expect(m.blocks.map((b) => b.source)).toEqual(["GitHub"]);
    expect(m.blocks[0].groups.map((g) => g.label)).toEqual(["Counted", "Counted less", "Not counted"]);
    expect(all(m)).toContain("a quarter (1,200 here)");
    expect(all(m)).toContain("Blank lines (340 here)");
    expect(all(m)).toContain("lock files");
    expect(m.footer).toEqual(["Scoring rules version 2.", OUTSIDE_WORK_LINE]);
  });

  it("omits counts that are zero or unknown, and the rules line when the version is unknown", () => {
    const m = howCounted({ voice: "member", github: {}, docs: { images: 0, importedChars: 0 }, rulesVersion: null });
    expect(all(m)).not.toMatch(/here\)/);
    expect(all(m)).not.toContain("Imported .docx");
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
    expect(text).toContain("still in the document (700 characters here)");
    expect(text).toContain("(about 250 characters)");
    expect(text).toContain("Imported .docx text");
    expect(text).toContain("Inserted images (2 here)");
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
