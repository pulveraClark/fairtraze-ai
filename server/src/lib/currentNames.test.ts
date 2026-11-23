import { describe, it, expect } from "vitest";
import { buildNameMap, swapNames, withCurrentNames, type CurrentPerson } from "./currentNames.js";

const person = (name: string, deleted = false, githubUsername: string | null = null): CurrentPerson => ({ name, githubUsername, deleted });
const people = (o: Record<number, CurrentPerson>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));

describe("buildNameMap", () => {
  it("maps a renamed member old -> new", () => {
    const m = buildNameMap([{ userId: 1, name: "Christian Lenizo" }], people({ 1: person("Christian Gwapo") }));
    expect(m.get("Christian Lenizo")).toBe("Christian Gwapo");
  });
  it("no entry when the name is the same", () => {
    expect(buildNameMap([{ userId: 1, name: "Ana Cruz" }], people({ 1: person("Ana Cruz") })).size).toBe(0);
  });
  it("skips two members with the same stored name", () => {
    const m = buildNameMap([{ userId: 1, name: "Sam Lee" }, { userId: 2, name: "Sam Lee" }], people({ 1: person("Sam A"), 2: person("Sam B") }));
    expect(m.size).toBe(0);
  });
  it("skips two members with the same current name", () => {
    const m = buildNameMap([{ userId: 1, name: "Ana" }, { userId: 2, name: "Ben" }], people({ 1: person("Chris"), 2: person("chris") }));
    expect(m.size).toBe(0);
  });
  it("keeps the stored text for a deleted or missing user and for the Former member placeholder", () => {
    const m = buildNameMap(
      [{ userId: 1, name: "Ana Cruz" }, { userId: 2, name: "Ben Ray" }, { userId: 3, name: "Former member" }],
      people({ 1: person("Former member", true), 3: person("Cy Dee") }),
    );
    expect(m.size).toBe(0);
  });
});

describe("swapNames", () => {
  const map = new Map([["Christian Lenizo", "Christian Gwapo"]]);
  it("replaces whole names, case-insensitively", () => {
    expect(swapNames("Christian Lenizo has a flag. christian lenizo again.", map)).toBe("Christian Gwapo has a flag. Christian Gwapo again.");
  });
  it("does not change a name inside a longer word", () => {
    const m = new Map([["Ann", "Beth"]]);
    expect(swapNames("Joann, Annabel and Ann met.", m)).toBe("Joann, Annabel and Beth met.");
  });
  it("is one pass: a replacement is not replaced again", () => {
    const m = new Map([["Ana", "Ben"], ["Ben", "Cy"]]);
    expect(swapNames("Ana and Ben", m)).toBe("Ben and Cy");
  });
  it("longest name first", () => {
    const m = new Map([["Ana Cruz", "Ana Reyes"], ["Ana", "Zed"]]);
    expect(swapNames("Ana Cruz and Ana", m)).toBe("Ana Reyes and Zed");
  });
  it("returns the text unchanged with an empty map", () => {
    expect(swapNames("Ana", new Map())).toBe("Ana");
  });
});

describe("withCurrentNames", () => {
  const report = { members: [{ userId: 1, studentName: "Old", githubUsername: "" }, { githubUsername: "gh2", studentName: "Two" }, { userId: 3, studentName: "Former member" }] } as never;
  it("sets live names by id, by login, leaves deleted ones and never mutates the input", () => {
    const cur = people({ 1: person("New"), 2: person("Second", false, "GH2"), 3: person("Whoever", true) });
    const out = withCurrentNames(report, cur) as unknown as { members: Array<{ studentName: string }> };
    expect(out.members.map((m) => m.studentName)).toEqual(["New", "Second", "Former member"]);
    expect((report as unknown as { members: Array<{ studentName: string }> }).members[0]!.studentName).toBe("Old");
  });
});
