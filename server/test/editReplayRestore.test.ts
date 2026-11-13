import { describe, it, expect } from "vitest";
import type { EditEvent } from "@prisma/client";
import { replayEditEvents, RESTORE_MIN_CHARS, RESTORE_WINDOW_MS, RESTORE_MAX_REMEMBERED_PER_USER } from "../src/collab/editReplay.js";

// Pure replay tests: no database. A = 1, B = 2, C = 3.
const A = 1, B = 2, C = 3;
const T0 = Date.UTC(2026, 10, 10, 2, 0, 0);
let nextId = 1;
type Partial_ = Partial<EditEvent> & Pick<EditEvent, "userId" | "eventType" | "position" | "length">;
const ev = (e: Partial_, at = T0): EditEvent =>
  ({
    id: nextId++, documentId: 1, timestamp: new Date(at), editType: "SUBSTANTIVE", source: "LIVE", insertedText: null, deletedText: null, ...e,
  }) as EditEvent;
const ins = (userId: number, position: number, text: string, at = T0) =>
  ev({ userId, eventType: "INSERT", position, length: text.length, insertedText: text }, at);
const del = (userId: number, position: number, text: string, at = T0) =>
  ev({ userId, eventType: "DELETE", position, length: text.length, deletedText: text }, at);
const owners = (r: ReturnType<typeof replayEditEvents>) => {
  const c: Record<number, number> = {};
  for (const s of r.slots) c[s.userId] = (c[s.userId] ?? 0) + 1;
  return c;
};
const BASE = "A".repeat(100);
const CHUNK = "c".repeat(30);

describe("replayEditEvents - ownership return", () => {
  it("delete then undo: the text goes back to its owner and is not the deleter's new writing", () => {
    const r = replayEditEvents([ins(A, 0, BASE), del(B, 10, CHUNK), ins(B, 10, CHUNK, T0 + 1000)]);
    expect(owners(r)).toEqual({ [A]: 100 });
    expect(r.totalInserted.get(B) ?? 0).toBe(0);
    expect(r.restoredChars.get(B)).toBe(30);
    expect(r.totalDeleted.get(B)).toBe(30); // churn stays what was done
  });

  it("moving someone else's text (cut, then paste elsewhere) keeps it theirs", () => {
    const text = "x".repeat(40);
    const r = replayEditEvents([ins(A, 0, text + "tail" + "y".repeat(20)), del(B, 0, text), ins(B, 20, text, T0 + 3600_000)]);
    expect(owners(r)).toEqual({ [A]: 64 });
  });

  it("a restored slot keeps its original weight, source and day", () => {
    const r = replayEditEvents([
      ev({ userId: A, eventType: "INSERT", position: 0, length: 30, insertedText: "z".repeat(30), editType: "REVISION", source: "IMPORT" }, T0),
      del(B, 0, "z".repeat(30), T0 + 1000),
      ins(B, 0, "z".repeat(30), T0 + 2000),
    ]);
    expect(r.slots).toHaveLength(30);
    expect(r.slots.every((s) => s.userId === A && s.source === "IMPORT" && s.weight === r.slots[0].weight && s.day === "2026-11-10")).toBe(true);
  });

  it("mixed owners: only the characters that were someone else's go back; the deleter's own stay", () => {
    const aText = "a".repeat(30), bText = "b".repeat(30);
    const r = replayEditEvents([
      ins(A, 0, aText), ins(B, 30, bText, T0 + 1000),
      del(B, 0, aText + bText, T0 + 2000),
      ins(B, 0, aText + bText, T0 + 3000),
    ]);
    expect(owners(r)).toEqual({ [A]: 30, [B]: 30 });
    expect(r.restoredChars.get(B)).toBe(30);
    expect(r.totalInserted.get(B)).toBe(30 + 30); // own first insert 30 + the 30 own characters of the re-insert
  });

  it("honest cut-and-paste of your own text is unchanged", () => {
    const text = "m".repeat(40);
    const r = replayEditEvents([ins(A, 0, text + "n".repeat(20)), del(A, 0, text, T0 + 1000), ins(A, 20, text, T0 + 2000)]);
    expect(owners(r)).toEqual({ [A]: 60 });
    expect(r.totalInserted.get(A)).toBe(60 + 40);
    expect(r.restoredChars.size).toBe(0);
  });

  it("does not apply under the minimum length, after 24 hours, to an edited paste-back, or without stored text", () => {
    const short = "s".repeat(RESTORE_MIN_CHARS - 1);
    expect(owners(replayEditEvents([ins(A, 0, short + "pad"), del(B, 0, short), ins(B, 0, short, T0 + 1000)]))).toEqual({ [A]: 3, [B]: short.length });

    const t = "t".repeat(40);
    const late = replayEditEvents([ins(A, 0, t), del(B, 0, t), ins(B, 0, t, T0 + RESTORE_WINDOW_MS + 1)]);
    expect(owners(late)).toEqual({ [B]: 40 });
    const onTime = replayEditEvents([ins(A, 0, t), del(B, 0, t), ins(B, 0, t, T0 + RESTORE_WINDOW_MS)]);
    expect(owners(onTime)).toEqual({ [A]: 40 });

    const edited = replayEditEvents([ins(A, 0, t), del(B, 0, t), ins(B, 0, t.slice(0, -1) + "!", T0 + 1000)]);
    expect(owners(edited)).toEqual({ [B]: 40 });

    const noText = replayEditEvents([ins(A, 0, t), ev({ userId: B, eventType: "DELETE", position: 0, length: 40 }), ev({ userId: B, eventType: "INSERT", position: 0, length: 40 }, T0 + 1000)]);
    expect(owners(noText)).toEqual({ [B]: 40 });
  });

  it("a removal is used up once, and only the same user's re-insert returns it", () => {
    const t = "u".repeat(40);
    const twice = replayEditEvents([ins(A, 0, t), del(B, 0, t), ins(B, 0, t, T0 + 1000), ins(B, 0, t, T0 + 2000)]);
    expect(owners(twice)).toEqual({ [A]: 40, [B]: 40 });
    const other = replayEditEvents([ins(A, 0, t), del(B, 0, t), ins(C, 0, t, T0 + 1000)]);
    expect(owners(other)).toEqual({ [C]: 40 });
  });

  it("at the cap the oldest removal is forgotten and its later insert counts as new text", () => {
    const chunk = (i: number) => String(i).padStart(3, "0").repeat(8); // 24 distinct characters
    const n = RESTORE_MAX_REMEMBERED_PER_USER + 1;
    const events: EditEvent[] = [ins(A, 0, "q".repeat(24 * n))];
    for (let i = 0; i < n; i++) events.push(del(B, 0, chunk(i), T0 + 1000 + i));
    const oldest = replayEditEvents([...events, ins(B, 0, chunk(0), T0 + 900_000)]);
    expect(oldest.restoredChars.get(B) ?? 0).toBe(0);
    const newest = replayEditEvents([...events, ins(B, 0, chunk(n - 1), T0 + 900_000)]);
    expect(newest.restoredChars.get(B)).toBe(24);
  });

  it("reports which insert event handed text back", () => {
    const t = "r".repeat(40);
    const back = ins(B, 0, t, T0 + 1000);
    const r = replayEditEvents([ins(A, 0, t), del(B, 0, t), back]);
    expect(r.restoredByEvent.get(back.id)).toBe(40);
  });
});
