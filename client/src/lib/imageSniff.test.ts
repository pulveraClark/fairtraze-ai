import { describe, it, expect } from "vitest";
import { isSupportedImageHeader } from "./imageSniff";

describe("isSupportedImageHeader", () => {
  it("accepts a real PNG header", () => {
    const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(isSupportedImageHeader(header)).toBe(true);
  });

  it("accepts a real JPEG header", () => {
    const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(isSupportedImageHeader(header)).toBe(true);
  });

  it("accepts a real WebP header", () => {
    // "RIFF" + 4 size bytes + "WEBP"
    const header = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(isSupportedImageHeader(header)).toBe(true);
  });

  // The actual scenario the client-side content-sniffing is meant to catch: a non-image file
  // renamed with a .png/.jpg extension (or given a spoofed File.type) must still be rejected,
  // since the check reads real bytes, never the filename or declared MIME type.
  it("rejects a .docx file renamed to look like an image", () => {
    // A .docx is a zip archive — real "PK\x03\x04" magic bytes, not any supported image format.
    const docxHeaderRenamedAsPng = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(isSupportedImageHeader(docxHeaderRenamedAsPng)).toBe(false);
  });

  it("rejects plain text content", () => {
    const textHeader = new TextEncoder().encode("not an image!");
    expect(isSupportedImageHeader(textHeader)).toBe(false);
  });

  it("rejects an empty/too-short header", () => {
    expect(isSupportedImageHeader(new Uint8Array(0))).toBe(false);
  });
});
