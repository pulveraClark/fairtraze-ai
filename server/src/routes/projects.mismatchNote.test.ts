import { describe, it, expect } from "vitest";
import { githubCommitsOf, editorSessionCountOf, buildMismatchNotes } from "./projects.js";
import type { AnyScoredMember, ScoredMember, DocumentScoredMember, CombinedScoredMember, FunctionalRole } from "@shared/types.js";

// Minimal fixtures — only the fields these two helpers read are populated;
// the rest are irrelevant to field-access correctness.
function combined(opts: Partial<CombinedScoredMember>): CombinedScoredMember {
  return {
    studentName: "Member", userId: 1, githubUsername: "member",
    githubContributionShare: 0, documentContributionShare: 0,
    wGitHub: 0.5, wDocs: 0.5, contributionShare: 0, lastPhaseRatio: 0,
    flags: [], github: null, document: null,
    ...opts,
  } as CombinedScoredMember;
}

function github(commits: number): ScoredMember {
  return { commits } as ScoredMember;
}

function document(sessionCount: number): DocumentScoredMember {
  return { sessionCount, userId: 1 } as DocumentScoredMember;
}

describe("githubCommitsOf", () => {
  it("reads nested github.commits for a COMBINED member with zero GitHub commits", () => {
    const m = combined({ github: github(0) });
    expect(githubCommitsOf(m)).toBe(0);
  });

  it("returns undefined for a COMBINED member with no GitHub record at all", () => {
    const m = combined({ github: null });
    expect(githubCommitsOf(m)).toBeUndefined();
  });

  it("reads nested github.commits for a COMBINED member with real GitHub activity", () => {
    const m = combined({ github: github(12) });
    expect(githubCommitsOf(m)).toBe(12);
  });

  it("reads flat commits for a GITHUB-only member (unaffected by the fix)", () => {
    const m = github(0);
    expect(githubCommitsOf(m as AnyScoredMember)).toBe(0);
  });

  it("returns undefined when there is no scored member", () => {
    expect(githubCommitsOf(undefined)).toBeUndefined();
    expect(githubCommitsOf(null)).toBeUndefined();
  });
});

describe("editorSessionCountOf", () => {
  it("reads nested document.sessionCount for a COMBINED member with zero editor sessions", () => {
    const m = combined({ document: document(0) });
    expect(editorSessionCountOf(m)).toBe(0);
  });

  it("returns undefined for a COMBINED member with no document record at all", () => {
    const m = combined({ document: null });
    expect(editorSessionCountOf(m)).toBeUndefined();
  });

  it("reads nested document.sessionCount for a COMBINED member with real editor activity", () => {
    const m = combined({ document: document(5) });
    expect(editorSessionCountOf(m)).toBe(5);
  });

  it("reads flat sessionCount for an EDITOR-only member (unaffected by the fix)", () => {
    const m = document(0);
    expect(editorSessionCountOf(m as AnyScoredMember)).toBe(0);
  });

  it("returns undefined when there is no doc activity record", () => {
    expect(editorSessionCountOf(undefined)).toBeUndefined();
    expect(editorSessionCountOf(null)).toBeUndefined();
  });
});

describe("buildMismatchNotes", () => {
  const BOTH: FunctionalRole[] = ["DEVELOPER", "DOCUMENTATION"];

  it("produces both notes for a dual-role member who mismatches on both, without either overwriting the other", () => {
    const notes = buildMismatchNotes(BOTH, github(0), document(0));
    expect(notes).toEqual([
      "Developer — no recorded GitHub activity",
      "Documentation — no recorded editor activity",
    ]);
  });

  it("produces only the Developer note when only GitHub activity is missing", () => {
    const notes = buildMismatchNotes(BOTH, github(0), document(5));
    expect(notes).toEqual(["Developer — no recorded GitHub activity"]);
  });

  it("produces only the Documentation note when only editor activity is missing", () => {
    const notes = buildMismatchNotes(BOTH, github(10), document(0));
    expect(notes).toEqual(["Documentation — no recorded editor activity"]);
  });

  it("produces no notes for a dual-role member with real activity on both sides", () => {
    const notes = buildMismatchNotes(BOTH, github(10), document(5));
    expect(notes).toEqual([]);
  });

  it("only evaluates the roles the member actually holds", () => {
    const notes = buildMismatchNotes(["DEVELOPER"], github(0), document(0));
    expect(notes).toEqual(["Developer — no recorded GitHub activity"]);
  });
});
