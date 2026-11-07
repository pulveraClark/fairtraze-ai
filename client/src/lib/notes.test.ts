import { describe, it, expect } from "vitest";
import { noteFlags, sortNotes, noteStage, noteOutcomeText, formatNoteDate, NOTE_STAGE } from "./notes";

describe("notes helpers", () => {
  it("reads the flags captured at submission and tolerates legacy or broken values", () => {
    expect(noteFlags({ disputedFlags: '["inactive","overload"]' })).toEqual(["inactive", "overload"]);
    expect(noteFlags({ disputedFlags: "" })).toEqual([]);
    expect(noteFlags({ disputedFlags: "not json" })).toEqual([]);
    expect(noteFlags({ disputedFlags: '{"a":1}' })).toEqual([]);
  });
  it("sorts newest first without changing the input", () => {
    const input = [{ createdAt: "2026-10-01T00:00:00Z" }, { createdAt: "2026-10-03T00:00:00Z" }, { createdAt: "2026-10-02T00:00:00Z" }];
    expect(sortNotes(input).map((n) => n.createdAt.slice(8, 10))).toEqual(["03", "02", "01"]);
    expect(input[0]!.createdAt.slice(8, 10)).toBe("01");
  });
  it("words every stage in text: Sent, Seen, Answered", () => {
    expect(NOTE_STAGE.sent.label).toBe("Sent");
    expect(NOTE_STAGE.seen.label).toBe("Seen");
    expect(NOTE_STAGE.answered.label).toBe("Answered");
  });
  it("is Sent until the instructor opens it, Seen after, Answered once replied", () => {
    expect(noteStage({ status: "OPEN", seenAt: null })).toBe("sent");
    expect(noteStage({ status: "OPEN" })).toBe("sent"); // notes from before seenAt existed
    expect(noteStage({ status: "OPEN", seenAt: "2026-10-19T10:00:00Z" })).toBe("seen");
    expect(noteStage({ status: "RESOLVED", seenAt: null })).toBe("answered");
    expect(noteStage({ status: "DISMISSED", seenAt: "2026-10-19T10:00:00Z" })).toBe("answered");
  });
  it("dates use the school's Manila day, date only, whatever the browser's time zone", () => {
    expect(formatNoteDate("2026-10-19T15:59:00Z")).toBe("Oct 19, 2026"); // 11:59 PM in Manila
    expect(formatNoteDate("2026-10-19T16:00:00Z")).toBe("Oct 20, 2026"); // midnight in Manila: the next day
    expect(formatNoteDate("2026-10-19T16:30:00Z")).toBe("Oct 20, 2026"); // 12:30 AM in Manila
    expect(formatNoteDate("2026-10-19T00:30:00Z")).toBe("Oct 19, 2026");
    expect(formatNoteDate("2026-10-19T15:45:00Z")).not.toMatch(/\d:\d\d/);
  });
  it("states the instructor's decision in plain words", () => {
    expect(noteOutcomeText("RESOLVED")).toBe("Your instructor accepted your note");
    expect(noteOutcomeText("DISMISSED")).toBe("Your instructor kept the result");
  });
});
