import { describe, it, expect } from "vitest";
import { noteFlags, sortNotes, NOTE_STATUS } from "./notes";

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
  it("words every status in text", () => {
    expect(NOTE_STATUS.OPEN.label).toMatch(/awaiting/i);
    expect(NOTE_STATUS.RESOLVED.label).toMatch(/accepted/i);
    expect(NOTE_STATUS.DISMISSED.label).toMatch(/upheld/i);
  });
});
