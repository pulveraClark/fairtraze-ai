import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPdf, downloadBlob } from "./pdfExport";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("downloadBlob", () => {
  it("saves the blob under the given name through a temporary link, then cleans up", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:test-url");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    let clicked: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this;
      expect(document.body.contains(this)).toBe(true); // it must be in the page to be clickable in every browser
    });
    const blob = new Blob(["%PDF-1.7"], { type: "application/pdf" });

    downloadBlob(blob, "Group 4 Report.pdf");

    expect(create).toHaveBeenCalledWith(blob);
    expect(clicked).not.toBeNull();
    expect(clicked!.download).toBe("Group 4 Report.pdf");
    expect(clicked!.getAttribute("href")).toBe("blob:test-url");
    expect(document.querySelector("a")).toBeNull(); // removed again
    expect(revoke).not.toHaveBeenCalled(); // the download may still be starting
    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledWith("blob:test-url");
  });
});

describe("buildPdf", () => {
  it("rejects with an AbortError, without touching the page, when cancelled before it starts", async () => {
    const ac = new AbortController();
    ac.abort();
    const before = document.querySelectorAll("iframe").length;
    await expect(
      buildPdf({ json: { type: "doc", content: [{ type: "paragraph" }] }, size: "LETTER", title: "x", signal: ac.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(document.querySelectorAll("iframe").length).toBe(before); // no offscreen copy was created
  });
});
