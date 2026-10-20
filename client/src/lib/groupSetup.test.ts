import { describe, it, expect } from "vitest";
import { deriveSetupProgress, repoFeedback, setupCardVisible, membersLinkedLine, type GroupSetup } from "./groupSetup";

const setup = (over: Partial<GroupSetup> = {}): GroupSetup => ({
  needsRepo: true, repoUrl: null, repoLinked: false, isLeader: false, canLinkRepo: true, canChangeRepo: false,
  viewerHasGithubUsername: false, usernames: { linked: 0, total: 5, missingNames: [] }, ...over,
});

describe("deriveSetupProgress", () => {
  it("not started: nothing done", () => {
    const p = deriveSetupProgress(setup());
    expect(p).toMatchObject({ state: "not-started", doneCount: 0, total: 3, complete: false, label: "0 of 3 done" });
  });
  it("partial: a linked repository counts as steps 1 and 2 (2 of 3 done)", () => {
    const p = deriveSetupProgress(setup({ repoLinked: true, repoUrl: "https://github.com/a/b", usernames: { linked: 3, total: 5, missingNames: ["X", "Y"] } }));
    expect(p).toMatchObject({ state: "partial", doneCount: 2, label: "2 of 3 done" });
    expect(p.steps.map((s) => s.done)).toEqual([true, true, false]);
  });
  it("partial: usernames done but no repository is 1 of 3", () => {
    const p = deriveSetupProgress(setup({ usernames: { linked: 5, total: 5, missingNames: [] } }));
    expect(p).toMatchObject({ state: "partial", doneCount: 1 });
  });
  it("done: repository linked and every member linked", () => {
    const p = deriveSetupProgress(setup({ repoLinked: true, usernames: { linked: 5, total: 5, missingNames: [] } }));
    expect(p).toMatchObject({ state: "done", complete: true, label: "3 of 3 done" });
  });
  it("Docs-only groups have no steps and are never shown the card", () => {
    const s = setup({ needsRepo: false });
    expect(deriveSetupProgress(s).steps).toEqual([]);
    expect(setupCardVisible(s)).toBe(false);
  });
});

describe("setupCardVisible", () => {
  it("shows only while incomplete, and not before the data arrives", () => {
    expect(setupCardVisible(undefined)).toBe(false);
    expect(setupCardVisible(setup())).toBe(true);
    expect(setupCardVisible(setup({ repoLinked: true, usernames: { linked: 2, total: 2, missingNames: [] } }))).toBe(false);
  });
});

describe("repoFeedback (live format check)", () => {
  it("is quiet while the field is empty and untouched", () => {
    expect(repoFeedback("", false)).toEqual({ kind: "empty" });
  });
  it("does not shout at a few typed characters, but does once it is a real attempt", () => {
    expect(repoFeedback("https://g", false)).toEqual({ kind: "empty" });
    expect(repoFeedback("https://gitlab.com/a/b", false)).toMatchObject({ kind: "error", message: expect.stringMatching(/not a GitHub link/) });
  });
  it("confirms a valid link at once and tidies it", () => {
    expect(repoFeedback("github.com/acme/app.git", false)).toEqual({ kind: "ok", url: "https://github.com/acme/app", shown: "github.com/acme/app" });
  });
  it("after leaving an empty field it asks for the link", () => {
    expect(repoFeedback("", true)).toMatchObject({ kind: "error", message: "Paste the link to your GitHub repository." });
  });
  it("says what to fix for a link with a path", () => {
    expect(repoFeedback("https://github.com/acme/app/tree/main", true)).toMatchObject({ kind: "error", message: expect.stringMatching(/Remove everything after/) });
  });
});

describe("membersLinkedLine", () => {
  it("reads 3 of 5 members linked", () => {
    expect(membersLinkedLine({ linked: 3, total: 5, missingNames: [] })).toBe("3 of 5 members linked");
  });
});
