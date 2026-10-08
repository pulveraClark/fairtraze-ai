import { describe, it, expect } from "vitest";
import { extractJoinCode } from "./joinCodeFromQr";

describe("extractJoinCode", () => {
  it("accepts a bare code", () => expect(extractJoinCode("  FT-APPS-2026 ")).toBe("FT-APPS-2026"));
  it("extracts code from a join URL", () =>
    expect(extractJoinCode("https://app.example.com/join?code=FT-APPS-2026")).toBe("FT-APPS-2026"));
  it("decodes encoded characters", () =>
    expect(extractJoinCode("http://localhost:5173/join?code=AB%2FCD")).toBe("AB/CD"));
  it("rejects a URL without a code", () => expect(extractJoinCode("https://example.com/")).toBeNull());
  it("rejects empty and free text", () => {
    expect(extractJoinCode("   ")).toBeNull();
    expect(extractJoinCode("hello world")).toBeNull();
  });
});
