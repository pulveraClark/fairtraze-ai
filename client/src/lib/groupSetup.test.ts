import { describe, it, expect } from "vitest";
import { deriveSetupProgress, repoFeedback, setupCardVisible, membersLinkedLine, setupNudge, setupGateVisible, type GroupSetup } from "./groupSetup";

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

describe("saved link marks the Create step done", () => {
  it("steps 1 and 2 flip together when repoLinked", () => {
    const p = deriveSetupProgress(setup({ repoLinked: true }));
    expect(p.steps.find((x) => x.id === "create")?.done).toBe(true);
    expect(p.steps.find((x) => x.id === "link")?.done).toBe(true);
  });
});

describe("setupNudge matrix", () => {
  const lead = { isLeader: true };
  const linked = { repoLinked: true, repoUrl: "https://github.com/a/b" };
  it("is null when complete or Docs-only", () => {
    expect(setupNudge(setup({ needsRepo: false }))).toBeNull();
    expect(setupNudge(setup({ ...linked, usernames: { linked: 5, total: 5, missingNames: [] } }))).toBeNull();
  });
  it("leader: link first, then own username, then waiting", () => {
    expect(setupNudge(setup(lead))).toEqual({ label: "Setup 0 of 3", action: "Paste the repository link" });
    expect(setupNudge(setup({ ...lead, ...linked }))).toEqual({ label: "Setup 2 of 3", action: "Add your GitHub username" });
    expect(setupNudge(setup({ ...lead, ...linked, viewerHasGithubUsername: true }))?.action).toMatch(/^Waiting for other members/);
  });
  it("member: own username first, then waiting for the leader, then others", () => {
    expect(setupNudge(setup())?.action).toBe("Add your GitHub username");
    expect(setupNudge(setup({ viewerHasGithubUsername: true }))?.action).toBe("Waiting for your leader to link the repository");
    expect(setupNudge(setup({ ...linked, viewerHasGithubUsername: true }))?.action).toMatch(/^Waiting for other members/);
  });
  it("a member never sees the leader's action", () => {
    expect(setupNudge(setup({ canLinkRepo: true }))?.action).not.toMatch(/Paste/);
  });
});

describe("setupGateVisible", () => {
  it("only for a leader whose group needs a repo that is not linked and not skipped", () => {
    expect(setupGateVisible(undefined, false)).toBe(false);
    expect(setupGateVisible(setup({ isLeader: true }), false)).toBe(true);
    expect(setupGateVisible(setup({ isLeader: true }), true)).toBe(false);
    expect(setupGateVisible(setup({ isLeader: false }), false)).toBe(false);
    expect(setupGateVisible(setup({ isLeader: true, needsRepo: false }), false)).toBe(false);
    expect(setupGateVisible(setup({ isLeader: true, repoLinked: true }), false)).toBe(false);
  });
});
