import { describe, it, expect } from "vitest";
import { squareCrop, encodeUnderLimit, isAcceptedAvatarSource } from "./avatarImage";

describe("avatarImage", () => {
  it("center-crops landscape and portrait images to a square", () => {
    expect(squareCrop(400, 200)).toEqual({ sx: 100, sy: 0, side: 200 });
    expect(squareCrop(200, 500)).toEqual({ sx: 0, sy: 150, side: 200 });
  });

  it("steps quality down until the blob fits", async () => {
    const tried: number[] = [];
    const blob = await encodeUnderLimit(async (mime, q) => {
      tried.push(q);
      return new Blob([new Uint8Array(q > 0.7 ? 300 : 50)], { type: mime });
    }, 100);
    expect(blob?.size).toBe(50);
    expect(tried).toEqual([0.9, 0.8, 0.7]);
  });

  it("falls back to JPEG when WebP encoding is unsupported, and gives null if nothing fits", async () => {
    const jpeg = await encodeUnderLimit(
      async (mime) => new Blob([new Uint8Array(10)], { type: mime === "image/webp" ? "image/png" : mime }), 100);
    expect(jpeg?.type).toBe("image/jpeg");
    expect(await encodeUnderLimit(async (mime) => new Blob([new Uint8Array(500)], { type: mime }), 100)).toBeNull();
  });

  it("validates the source type and size", () => {
    expect(isAcceptedAvatarSource({ type: "image/gif", size: 10 })).toMatch(/JPEG/);
    expect(isAcceptedAvatarSource({ type: "image/png", size: 20 * 1024 * 1024 })).toMatch(/too large/);
    expect(isAcceptedAvatarSource({ type: "image/png", size: 1000 })).toBeNull();
  });
});
