import { describe, expect, it } from "vitest";
import { isSafeLinkUrl, normalizeLinkUrl } from "./linkUrl";

const c = (...codes: number[]) => String.fromCharCode(...codes);

describe("normalizeLinkUrl", () => {
  it("keeps http, https and mailto as typed", () => {
    expect(normalizeLinkUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeLinkUrl("https://example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
    expect(normalizeLinkUrl("mailto:a@example.com")).toBe("mailto:a@example.com");
    expect(normalizeLinkUrl("  https://example.com  ")).toBe("https://example.com");
  });

  it("turns a bare domain into https", () => {
    expect(normalizeLinkUrl("example.com")).toBe("https://example.com");
    expect(normalizeLinkUrl("www.example.com/path")).toBe("https://www.example.com/path");
    expect(normalizeLinkUrl("localhost:3000")).toBe("https://localhost:3000");
  });

  it("rejects dangerous and unsupported schemes", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://example.com",
      "blob:https://example.com/x",
      "tel:+123456",
    ]) {
      expect(normalizeLinkUrl(bad), bad).toBeNull();
    }
  });

  it("rejects obfuscated schemes built with whitespace and invisible characters", () => {
    expect(normalizeLinkUrl("java" + c(9) + "script:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("java" + c(10) + "script:alert(1)")).toBeNull();
    expect(normalizeLinkUrl(c(0) + "javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("java" + c(0x200b) + "script:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("java" + c(0x2028) + "script:alert(1)")).toBeNull();
    expect(normalizeLinkUrl(c(0xfeff) + "javascript:alert(1)")).toBeNull();
    // Hidden characters inside an otherwise allowed link are rejected, not silently stripped.
    expect(normalizeLinkUrl("https://exa" + c(0x200b) + "mple.com")).toBeNull();
  });

  it("rejects empty, non-string, protocol-relative and malformed input", () => {
    expect(normalizeLinkUrl("")).toBeNull();
    expect(normalizeLinkUrl("   ")).toBeNull();
    expect(normalizeLinkUrl(null)).toBeNull();
    expect(normalizeLinkUrl(undefined)).toBeNull();
    expect(normalizeLinkUrl("//evil.example.com")).toBeNull();
    expect(normalizeLinkUrl("just words")).toBeNull();
    expect(normalizeLinkUrl("hello")).toBeNull();
    expect(normalizeLinkUrl("https://")).toBeNull();
    expect(normalizeLinkUrl("mailto:")).toBeNull();
    expect(normalizeLinkUrl('https://example.com/"onclick="x')).toBeNull();
    expect(normalizeLinkUrl("https://example.com/" + "a".repeat(3000))).toBeNull();
  });
});

describe("isSafeLinkUrl", () => {
  it("accepts only explicit http(s)/mailto values exactly as stored", () => {
    expect(isSafeLinkUrl("https://example.com")).toBe(true);
    expect(isSafeLinkUrl("mailto:a@example.com")).toBe(true);
    expect(isSafeLinkUrl("example.com")).toBe(false);
    expect(isSafeLinkUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeLinkUrl("data:text/html,x")).toBe(false);
    expect(isSafeLinkUrl(null)).toBe(false);
  });
});
