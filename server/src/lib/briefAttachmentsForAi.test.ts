import { describe, it, expect, vi } from "vitest";

// Pure test: no database. The shared test setup still calls these after each test.
vi.mock("./prisma.js", () => ({ prisma: { $queryRaw: async () => [], $disconnect: async () => {} } }));

import {
  BRIEF_AI_MAX_IMAGES, BRIEF_AI_MAX_PDF_PAGES, BRIEF_AI_MAX_TOTAL_BYTES, BRIEF_IMAGE_MAX_BYTES, BRIEF_PDF_MAX_BYTES,
  countPdfPages, selectBriefFilesForAi,
} from "./briefAttachments.js";

// Synthetic files only: magic bytes plus padding.
const png = (size = 100) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(size)]);
const jpeg = (size = 100) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(size)]);
const webp = () => Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(20)]);
const pdf = (pages: number, pad = 0) =>
  Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj << /Type /Pages /Count " + pages + " >> endobj\n"),
    ...Array.from({ length: pages }, (_, i) => Buffer.from(`${i + 2} 0 obj << /Type /Page >> endobj\n`)),
    Buffer.alloc(pad),
  ]);
const row = (id: number, filename: string, data: Buffer) => ({ id, filename, data });

describe("countPdfPages", () => {
  it("counts page objects, not the page tree", () => {
    expect(countPdfPages(pdf(3))).toBe(3);
  });
  it("is null when no page object is visible", () => {
    expect(countPdfPages(Buffer.from("%PDF-1.5 compressed"))).toBeNull();
  });
});

describe("selectBriefFilesForAi", () => {
  it("reads one PDF and images of every allowed type, in order", () => {
    const { usable, skipped } = selectBriefFilesForAi([
      row(1, "brief.pdf", pdf(2)), row(2, "a.png", png()), row(3, "b.jpg", jpeg()), row(4, "c.webp", webp()),
    ]);
    expect(skipped).toEqual([]);
    expect(usable.map((f) => [f.filename, f.mimeType])).toEqual([
      ["brief.pdf", "application/pdf"], ["a.png", "image/png"], ["b.jpg", "image/jpeg"], ["c.webp", "image/webp"],
    ]);
  });

  it("reads only the first 3 images and the first PDF", () => {
    const { usable, skipped } = selectBriefFilesForAi([
      row(1, "1.png", png()), row(2, "2.png", png()), row(3, "3.png", png()), row(4, "4.png", png()),
      row(5, "a.pdf", pdf(1)), row(6, "b.pdf", pdf(1)),
    ]);
    expect(usable.filter((f) => f.mimeType === "image/png")).toHaveLength(BRIEF_AI_MAX_IMAGES);
    expect(skipped).toEqual([{ filename: "4.png", reason: "TOO_MANY_FILES" }, { filename: "b.pdf", reason: "TOO_MANY_FILES" }]);
  });

  it("skips files over the per-type size cap, unknown types and long PDFs, with a reason", () => {
    const { usable, skipped } = selectBriefFilesForAi([
      row(1, "huge.png", png(BRIEF_IMAGE_MAX_BYTES)),
      row(2, "notes.txt", Buffer.from("plain text")),
      row(3, "long.pdf", pdf(BRIEF_AI_MAX_PDF_PAGES + 1)),
      row(4, "ok.png", png()),
    ]);
    expect(skipped).toEqual([
      { filename: "huge.png", reason: "TOO_LARGE" },
      { filename: "notes.txt", reason: "UNSUPPORTED" },
      { filename: "long.pdf", reason: "TOO_MANY_PAGES" },
    ]);
    expect(usable.map((f) => f.filename)).toEqual(["ok.png"]);
  });

  it("allows exactly 20 pages and does not guess when pages cannot be counted", () => {
    const { usable } = selectBriefFilesForAi([row(1, "twenty.pdf", pdf(BRIEF_AI_MAX_PDF_PAGES))]);
    expect(usable).toHaveLength(1);
    expect(selectBriefFilesForAi([row(1, "packed.pdf", Buffer.from("%PDF-1.5 x"))]).usable).toHaveLength(1);
  });

  it("stops at 6 MB in total", () => {
    const big = png(BRIEF_IMAGE_MAX_BYTES - 100);
    const { usable, skipped } = selectBriefFilesForAi([
      row(1, "brief.pdf", pdf(1, BRIEF_PDF_MAX_BYTES - 1000)), row(2, "1.png", big), row(3, "2.png", big),
    ]);
    expect(usable.map((f) => f.filename)).toEqual(["brief.pdf", "1.png"]);
    expect(skipped).toEqual([{ filename: "2.png", reason: "TOTAL_TOO_LARGE" }]);
    expect(usable.reduce((n, f) => n + f.data.length, 0)).toBeLessThanOrEqual(BRIEF_AI_MAX_TOTAL_BYTES);
  });

  it("trusts the bytes, not a stored label", () => {
    expect(selectBriefFilesForAi([row(1, "fake.pdf", png())]).usable[0]?.mimeType).toBe("image/png");
  });
});
