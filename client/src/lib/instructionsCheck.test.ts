import { describe, it, expect } from "vitest";
import {
  ATTENTION_ORDER, comparedSentence, countKinds, coveredSentence, coveredToggleLabel, droppedSentence, highlightFromHash, highlightHash,
  kindOf, otherCountsSentence, pillLabel,
} from "./instructionsCheck";
import type { AiBriefCheck } from "./aiReview";

type Req = AiBriefCheck["requirements"][number];
const req = (status: Req["status"], unverified = false): Req => ({ text: "R", status, unverified, evidence: [] });

describe("instructionsCheck wording", () => {
  it("classifies a requirement; unverified is 'check', never 'not covered'", () => {
    expect(kindOf(req("FOUND"))).toBe("COVERED");
    expect(kindOf(req("PARTLY_FOUND"))).toBe("PARTLY");
    expect(kindOf(req("NOT_FOUND"))).toBe("NOT_COVERED");
    expect(kindOf(req("NOT_FOUND", true))).toBe("CHECK");
    expect(ATTENTION_ORDER).toEqual(["PARTLY", "NOT_COVERED", "CHECK"]);
  });

  it("pill labels differ only for the 'check' state", () => {
    expect(pillLabel("COVERED", true)).toBe("Covered");
    expect(pillLabel("PARTLY", false)).toBe("Partly covered");
    expect(pillLabel("NOT_COVERED", false)).toBe("Not covered yet");
    expect(pillLabel("CHECK", true)).toBe("Needs your check");
    expect(pillLabel("CHECK", false)).toBe("Not clear yet");
  });

  it("covered sentence: of-total, all, and one requirement", () => {
    expect(coveredSentence(12, 13)).toBe("12 of 13 requirements are covered in the work.");
    expect(coveredSentence(13, 13)).toBe("All 13 requirements are covered in the work.");
    expect(coveredSentence(0, 4)).toBe("0 of 4 requirements are covered in the work.");
    expect(coveredSentence(1, 1)).toBe("The requirement is covered in the work.");
    expect(coveredSentence(0, 1)).toBe("0 of 1 requirement is covered in the work.");
  });

  it("other counts: zeros hidden, instructor and leader wording, null when nothing is left", () => {
    const counts = countKinds([req("FOUND"), req("PARTLY_FOUND"), req("NOT_FOUND"), req("NOT_FOUND"), req("NOT_FOUND", true)]);
    expect(otherCountsSentence(counts, true)).toBe("1 partly covered, 2 not covered yet, 1 needs your check.");
    expect(otherCountsSentence(counts, false)).toBe("1 partly covered, 2 not covered yet, 1 not clear yet.");
    expect(otherCountsSentence(countKinds([req("FOUND"), req("NOT_FOUND")]), true)).toBe("1 not covered yet.");
    expect(otherCountsSentence(countKinds([req("FOUND")]), true)).toBeNull();
  });

  it("toggle label and dropped sentence handle singular and plural", () => {
    expect(coveredToggleLabel(false, 12)).toBe("12 covered requirements · show");
    expect(coveredToggleLabel(true, 12)).toBe("12 covered requirements · hide");
    expect(coveredToggleLabel(false, 1)).toBe("1 covered requirement · show");
    expect(droppedSentence(1)).toBe("1 item the AI listed was not found in the project instructions and was left out.");
    expect(droppedSentence(2)).toBe("2 items the AI listed were not found in the project instructions and were left out.");
  });

  it("names the activity compared by source type, with the exact sentence when unknown", () => {
    expect(comparedSentence(undefined)).toBe("The AI compared the members' GitHub and Docs activity with the project instructions. It can make mistakes, so check anything important. This is not a grade.");
    expect(comparedSentence("COMBINED")).toContain("GitHub and Docs activity");
    expect(comparedSentence("GITHUB")).toContain("members' GitHub activity");
    expect(comparedSentence("EDITOR")).toContain("members' Docs activity");
  });
});

describe("highlight in the URL hash", () => {
  it("round-trips a sentence, including quotes and non-ASCII characters", () => {
    const quote = "Members can’t see each other’s scores — only “their own”.";
    expect(highlightHash(quote).startsWith("#highlight=")).toBe(true);
    expect(highlightHash(quote)).not.toContain("?");
    expect(highlightFromHash(highlightHash(quote))).toBe(quote);
  });

  it("ignores other hashes, empty values and broken encoding", () => {
    expect(highlightFromHash("")).toBeNull();
    expect(highlightFromHash("#other=1")).toBeNull();
    expect(highlightFromHash("#highlight=")).toBeNull();
    expect(highlightFromHash("#highlight=%E0%A4%A")).toBeNull();
  });
});
