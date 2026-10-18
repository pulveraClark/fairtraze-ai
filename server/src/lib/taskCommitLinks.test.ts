import { describe, it, expect } from "vitest";
import {
  commitUrl, firstLine, formatWait, parseRepoRef, parseTaskRefs, refreshWaitSeconds, validateTaskKey,
} from "./taskCommitLinks.js";

// Pure helpers: no database, no network.

describe("parseTaskRefs", () => {
  it("finds the key with a number, in any case", () => {
    expect(parseTaskRefs("FT-12: fix the login form", ["FT"])).toEqual([12]);
    expect(parseTaskRefs("fix ft-12 and Ft-7", ["FT"])).toEqual([12, 7]);
  });

  it("accepts the usual punctuation around it", () => {
    expect(parseTaskRefs("(FT-3) done", ["FT"])).toEqual([3]);
    expect(parseTaskRefs("closes FT-3.", ["FT"])).toEqual([3]);
    expect(parseTaskRefs("FT-3, FT-4; FT-5!", ["FT"])).toEqual([3, 4, 5]);
    expect(parseTaskRefs("[FT-3]", ["FT"])).toEqual([3]);
    expect(parseTaskRefs("line one\nrefs FT-9", ["FT"])).toEqual([9]);
  });

  it("respects word boundaries on both sides", () => {
    expect(parseTaskRefs("XFT-3 is not ours", ["FT"])).toEqual([]);
    expect(parseTaskRefs("FT-3abc", ["FT"])).toEqual([]);
    expect(parseTaskRefs("FT-3_x", ["FT"])).toEqual([]);
    expect(parseTaskRefs("my_FT-3", ["FT"])).toEqual([]);
    expect(parseTaskRefs("1FT-3", ["FT"])).toEqual([]);
    expect(parseTaskRefs("FT-", ["FT"])).toEqual([]);
    expect(parseTaskRefs("FT 3", ["FT"])).toEqual([]);
  });

  it("matches the current key and every alias", () => {
    expect(parseTaskRefs("APP-2 and FT-1 and GA-9", ["APP", "FT"])).toEqual([2, 1]);
  });

  it("tries the longest key first, so APP2 is not read as APP", () => {
    expect(parseTaskRefs("APP2-5", ["APP", "APP2"])).toEqual([5]);
    expect(parseTaskRefs("APP-5", ["APP", "APP2"])).toEqual([5]);
  });

  it("returns each number once, in order of appearance", () => {
    expect(parseTaskRefs("FT-2 FT-1 FT-2", ["FT"])).toEqual([2, 1]);
  });

  it("ignores zero, huge numbers and an empty key list", () => {
    expect(parseTaskRefs("FT-0", ["FT"])).toEqual([]);
    expect(parseTaskRefs("FT-99999999999999999999", ["FT"])).toEqual([]);
    expect(parseTaskRefs("FT-1", [])).toEqual([]);
    expect(parseTaskRefs("FT-1", ["", "  "])).toEqual([]);
  });

  it("does not treat key characters as a pattern", () => {
    expect(parseTaskRefs("A.B-1 and AXB-2", ["A.B"])).toEqual([1]);
  });
});

describe("firstLine", () => {
  it("keeps only the first line, trimmed", () => {
    expect(firstLine("  Add login FT-1  \n\nLong body here")).toBe("Add login FT-1");
    expect(firstLine("one\r\ntwo")).toBe("one");
  });
  it("caps very long lines", () => {
    const out = firstLine("x".repeat(500), 200);
    expect(out).toHaveLength(200);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("parseRepoRef and commitUrl", () => {
  it("reads owner and repo from the usual URL shapes, lower-cased for the key", () => {
    expect(parseRepoRef("https://github.com/Acme/App")).toMatchObject({ owner: "Acme", repo: "App", key: "acme/app" });
    expect(parseRepoRef("https://github.com/acme/app.git")).toMatchObject({ key: "acme/app" });
    expect(parseRepoRef("https://github.com/acme/app/")).toMatchObject({ key: "acme/app" });
    expect(parseRepoRef("git@github.com:acme/app.git")).toMatchObject({ key: "acme/app" });
  });
  it("returns null for nothing usable", () => {
    expect(parseRepoRef(null)).toBeNull();
    expect(parseRepoRef("")).toBeNull();
    expect(parseRepoRef("not a repo")).toBeNull();
  });
  it("builds a commit link only from a safe repo name and sha", () => {
    expect(commitUrl("acme/app", "a41f9c2d")).toBe("https://github.com/acme/app/commit/a41f9c2d");
    expect(commitUrl("acme/app", "javascript:alert(1)")).toBeNull();
    expect(commitUrl("acme/app/../../evil", "a41f9c2d")).toBeNull();
    expect(commitUrl("ACME/app", "a41f9c2d")).toBeNull(); // stored lower-case
  });
});

describe("refresh cooldown", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  it("is allowed when never refreshed or after 5 minutes", () => {
    expect(refreshWaitSeconds(null, now)).toBe(0);
    expect(refreshWaitSeconds(new Date("2026-10-18T11:55:00Z"), now)).toBe(0);
    expect(refreshWaitSeconds(new Date("2026-10-18T11:40:00Z"), now)).toBe(0);
  });
  it("tells how long is left, rounding up", () => {
    expect(refreshWaitSeconds(new Date("2026-10-18T11:58:00Z"), now)).toBe(180);
    expect(refreshWaitSeconds(new Date("2026-10-18T11:59:59.500Z"), now)).toBe(300);
    expect(refreshWaitSeconds(new Date("2026-10-18T11:55:01Z"), now)).toBe(1);
  });
  it("words the wait", () => {
    expect(formatWait(1)).toBe("1 second");
    expect(formatWait(45)).toBe("45 seconds");
    expect(formatWait(61)).toBe("2 minutes");
    expect(formatWait(180)).toBe("3 minutes");
    expect(formatWait(60)).toBe("1 minute");
  });
});

describe("validateTaskKey", () => {
  it("upper-cases and trims a good key", () => {
    expect(validateTaskKey(" app2 ")).toEqual({ ok: true, key: "APP2" });
    expect(validateTaskKey("ft")).toEqual({ ok: true, key: "FT" });
  });
  it("rejects bad shapes with a plain message", () => {
    for (const bad of ["", "A", "TOOLONG", "1AB", "A-B", "A B", "ÄB", 12, null, undefined]) {
      const r = validateTaskKey(bad);
      expect(r.ok).toBe(false);
    }
    const r = validateTaskKey("A");
    expect(r.ok ? "" : r.message).toMatch(/2 to 5 letters or digits/);
  });
});
