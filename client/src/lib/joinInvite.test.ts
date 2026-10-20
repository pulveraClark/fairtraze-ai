import { describe, it, expect, vi, afterEach } from "vitest";
import { joinInviteUrl, copyText } from "./joinInvite";

afterEach(() => vi.restoreAllMocks());

describe("joinInviteUrl", () => {
  it("builds origin + /join?code= with the code encoded", () => {
    expect(joinInviteUrl("AB12", "https://app.example")).toBe("https://app.example/join?code=AB12");
    expect(joinInviteUrl(" a b&c ", "https://x")).toBe("https://x/join?code=a%20b%26c");
  });
  it("defaults to the current origin", () => {
    expect(joinInviteUrl("Z9")).toBe(`${window.location.origin}/join?code=Z9`);
  });
});

describe("copyText", () => {
  it("is true when the clipboard accepts it and false when it refuses", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await copyText("hi")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hi");
    writeText.mockRejectedValueOnce(new Error("denied"));
    expect(await copyText("hi")).toBe(false);
  });
});
