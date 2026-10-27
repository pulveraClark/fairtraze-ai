import { describe, it, expect } from "vitest";
import { shapeBriefForViewer } from "../../routes/aiReview.js";
import { contributorsFor, headingAuthorIds, shortName, type ContributorLookup } from "./contributors.js";
import type { DocPiece } from "./docsEvidence.js";
import type { AiBriefContent } from "@shared/aiReviewTypes.js";

const lookup = (over: Partial<ContributorLookup> = {}): ContributorLookup => ({
  names: new Map([[1, "Zed Zamora"], [2, "Aldren Bautista"], [3, "Maya"]]),
  userByLogin: new Map([["zed-z", 1], ["aldren", 2]]),
  loginBySha: new Map([["s1", "Zed-Z"], ["s2", "ALDREN"], ["s3", "some-bot"], ["s4", "aldren"]]),
  ...over,
});

describe("contributorsFor", () => {
  it("is the de-duplicated authors of the proof, short names, sorted alphabetically", () => {
    const out = contributorsFor(
      [
        { type: "file", ref: "a.ts", commits: ["s1", "s2", "s4"] },
        { type: "doc", ref: "Intro", authors: [1, 3, 3] },
      ],
      lookup(),
    );
    expect(out).toEqual(["Aldren B.", "Maya", "Zed Z."]);
  });

  it("members whose short names clash show full names; everyone else stays 'First L.'", () => {
    const out = contributorsFor(
      [{ type: "doc", ref: "Intro", authors: [1, 2, 3] }],
      lookup({ names: new Map([[1, "Maria Santos"], [2, "Maria Soriano"], [3, "Aldren Bautista"]]) }),
    );
    expect(out).toEqual(["Aldren B.", "Maria Santos", "Maria Soriano"]);
  });

  it("leaves out a commit author who is not a member, and never returns a raw login", () => {
    const out = contributorsFor([{ type: "file", ref: "a.ts", commits: ["s3", "unknown-sha"] }], lookup());
    expect(out).toEqual([]);
  });

  it("leaves out a user id that is no longer a member", () => {
    expect(contributorsFor([{ type: "doc", ref: "Intro", authors: [99] }], lookup())).toEqual([]);
  });

  it("no proof gives an empty list", () => {
    expect(contributorsFor([], lookup())).toEqual([]);
  });

  it("heading-only proof uses the section's authors, never an empty list when someone wrote under it", () => {
    const out = contributorsFor(
      [{ type: "doc", ref: "Design", quote: "", heading: true } as never],
      lookup({ headingAuthors: (h) => (h === "Design" ? [2] : []) }),
    );
    expect(out).toEqual(["Aldren B."]);
  });
});

describe("shortName", () => {
  it("First L.", () => {
    expect(shortName("Aldren Bautista")).toBe("Aldren B.");
    expect(shortName("  Maria  de la Cruz ")).toBe("Maria C.");
    expect(shortName("Maya")).toBe("Maya");
  });
});

describe("headingAuthorIds", () => {
  // "Title" (0-5) | "Intro" heading (5-10) | body (10-30) | "Design" heading (30-36) | body (36-60)
  const piece = (start: number, end: number, text: string, heading: string | null, isHeading: boolean): DocPiece => ({ start, end, text, heading, isHeading });
  const pieces = [
    piece(0, 5, "Title", "Title", true),
    piece(5, 10, "Intro", "Intro", true),
    piece(10, 30, "intro body text here.", "Intro", false),
    piece(30, 36, "Design", "Design", true),
    piece(36, 60, "design body text here..", "Design", false),
  ];
  const spans = [
    { userId: 1, start: 0, end: 30 },
    { userId: 2, start: 30, end: 60 },
  ] as never;

  it("a section's authors are the people who wrote under that heading", () => {
    expect(headingAuthorIds("Design", pieces, spans)).toEqual([2]);
    expect(headingAuthorIds("Intro", pieces, spans)).toEqual([1]);
  });

  it("the document's first heading (its title) means everyone who wrote in the document", () => {
    expect(headingAuthorIds("Title", pieces, spans).sort()).toEqual([1, 2]);
  });
});

describe("shapeBriefForViewer contributors", () => {
  const content: AiBriefContent = {
    aiAddressedCount: 0,
    sources: { writtenBrief: true, filesRead: 0, skipped: [] },
    requirements: [
      { text: "Build a planner.", status: "FOUND", sourceQuote: "Build a planner.", evidence: [{ type: "file", ref: "a.ts", quote: "plan()", commits: ["s2"] }] },
      { text: "Write documentation.", status: "FOUND", sourceQuote: "Write documentation.", evidence: [{ type: "doc", ref: "Design", quote: "", heading: true }] },
      { text: "Add tests.", status: "NOT_FOUND", sourceQuote: "Add tests.", evidence: [] },
    ],
  };
  const row = { status: "OK", content, promptVersion: "brief-3", briefHash: null, reportId: 1, createdAt: new Date() };
  const current = { brief: "Build a planner.", latestReportId: 1 };
  const who = lookup({ headingAuthors: () => [1] });

  it("the instructor and the leader get contributors", () => {
    for (const viewer of ["instructor", "leader"] as const) {
      const view = shapeBriefForViewer(row, viewer, 1, current, null, who)!;
      expect(view.requirements.map((r) => r.contributors)).toEqual([["Aldren B."], ["Zed Z."], []]);
    }
  });

  it("a plain member gets no brief check and so no contributor data", () => {
    const view = shapeBriefForViewer(row, "member", 1, current, null, who);
    expect(view).toBeNull();
    expect(JSON.stringify(view)).not.toContain("Aldren");
  });

  it("without a lookup there is no contributors field at all", () => {
    const view = shapeBriefForViewer(row, "leader", 1, current)!;
    expect(JSON.stringify(view)).not.toContain("contributors");
  });
});
