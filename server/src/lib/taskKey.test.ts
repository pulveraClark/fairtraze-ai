import { describe, it, expect } from "vitest";
import { deriveTaskKey, effectiveTaskKey, TASK_KEY_PATTERN } from "./taskKey.js";

describe("deriveTaskKey", () => {
  it.each([
    ["Group 1", "G1"],
    ["Team Rocket", "TR"],
    ["FairTraze AI", "FA"],
    ["Alpha Beta Gamma Delta Epsilon", "ABGD"],
    ["  spaced   out  name ", "SON"],
    ["Café Dev", "CD"],
  ])("%s -> %s", (name, key) => {
    expect(deriveTaskKey(name)).toBe(key);
    expect(TASK_KEY_PATTERN.test(key)).toBe(true);
  });

  it.each(["", "Team", "1st Group", "!!!", "   "])("falls back to TASK for %j", (name) => {
    expect(deriveTaskKey(name)).toBe("TASK");
  });
});

describe("effectiveTaskKey", () => {
  it("prefers the stored key, else derives it from the group name", () => {
    expect(effectiveTaskKey({ taskKey: "ZZ", groupName: "Team Rocket" })).toBe("ZZ");
    expect(effectiveTaskKey({ taskKey: null, groupName: "Team Rocket" })).toBe("TR");
  });
});
