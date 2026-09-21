import { describe, it, expect } from "vitest";
import { parseDocxToChunks } from "./docxImport.js";
import { buildTestDocx } from "../../test/docxFixtures.js";

describe("parseDocxToChunks", () => {
  it("extracts headings distinguishable from paragraphs, in document order", async () => {
    const buffer = await buildTestDocx([
      { heading: "Introduction", level: 1 },
      { paragraph: "This is the first paragraph." },
      { heading: "Background", level: 2 },
      { paragraph: "This is the second paragraph." },
    ]);

    const chunks = await parseDocxToChunks(buffer);

    expect(chunks).toEqual([
      { kind: "heading", level: 1, text: "Introduction" },
      { kind: "paragraph", text: "This is the first paragraph." },
      { kind: "heading", level: 2, text: "Background" },
      { kind: "paragraph", text: "This is the second paragraph." },
    ]);
  });

  it("returns an empty chunk list for a structurally valid but textually empty document", async () => {
    const buffer = await buildTestDocx([]);
    const chunks = await parseDocxToChunks(buffer);
    expect(chunks).toEqual([]);
  });

  it("skips blank/whitespace-only paragraphs", async () => {
    const buffer = await buildTestDocx([
      { paragraph: "   " },
      { paragraph: "Real content." },
    ]);
    const chunks = await parseDocxToChunks(buffer);
    expect(chunks).toEqual([{ kind: "paragraph", text: "Real content." }]);
  });
});
