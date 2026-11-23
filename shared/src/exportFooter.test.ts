import { describe, it, expect } from "vitest";
import { exportedByLine } from "./exportFooter";

describe("exportedByLine", () => {
  it("names who exported, their email and the date (Manila day)", () => {
    expect(exportedByLine({ name: "Ana Reyes", email: "ana@example.test" }, new Date("2026-10-27T03:00:00Z")))
      .toBe("Exported by Ana Reyes, ana@example.test, 2026-10-27");
  });
  it("uses the Manila day at the UTC edge", () => {
    expect(exportedByLine({ name: "A", email: "a@b.c" }, new Date("2026-10-27T17:00:00Z"))).toBe("Exported by A, a@b.c, 2026-10-28");
  });
});
