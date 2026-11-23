import { describe, expect, it } from "vitest";
import { pdfFileName } from "./pdfFileName";

describe("pdfFileName", () => {
  it("is the document title plus .pdf", () => {
    expect(pdfFileName("Group 4 Report")).toBe("Group 4 Report.pdf");
    expect(pdfFileName("Ñandú & Co — Café ₱")).toBe("Ñandú & Co — Café ₱.pdf");
  });

  it("removes characters that are illegal in file names and collapses spaces", () => {
    expect(pdfFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a b c d e f g h i j.pdf");
    expect(pdfFileName("  many   spaces \t here ")).toBe("many spaces here.pdf");
    expect(pdfFileName("line\nbreak\u0000nul")).toBe("line break nul.pdf");
  });

  it("falls back to 'document' for an empty or unusable title", () => {
    for (const t of ["", "   ", "///", "...", null, undefined]) expect(pdfFileName(t as string)).toBe("document.pdf");
  });

  it("does not produce hidden names or Windows device names", () => {
    expect(pdfFileName(".hidden")).toBe("hidden.pdf");
    expect(pdfFileName("trailing...")).toBe("trailing.pdf");
    expect(pdfFileName("CON")).toBe("CON_.pdf");
    expect(pdfFileName("lpt1")).toBe("lpt1_.pdf");
  });

  it("limits the length", () => {
    const name = pdfFileName("x".repeat(500));
    expect(name.length).toBeLessThanOrEqual(104);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});
