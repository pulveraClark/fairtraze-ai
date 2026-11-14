import { describe, it, expect } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { plainTextRangeToPMRange, authorshipDecorationAttrs } from "./authorshipHighlight";
import { TINT_ALPHA, UNDERLINE_WIDTH_PX } from "./collabColors";

describe("authorshipDecorationAttrs", () => {
  it("gives a wash, a thin underline in the author's color and style, and the name as a hover title", () => {
    const attrs = authorshipDecorationAttrs(12, [5, 12], "Ana");
    expect(attrs.style).toContain(`rgba(199, 80, 0, ${TINT_ALPHA})`);
    expect(attrs.style).toContain(`underline dashed ${UNDERLINE_WIDTH_PX}px #C75000`);
    expect(attrs.style).not.toMatch(/wavy|double/);
    expect(attrs.title).toBe("Written by Ana");
  });

  it("differs between two authors in color and in underline style, and omits the title without a name", () => {
    const a = authorshipDecorationAttrs(5, [5, 12]);
    const b = authorshipDecorationAttrs(12, [5, 12]);
    expect(a.style).not.toBe(b.style);
    expect(a.style).toContain("underline solid");
    expect(a.title).toBeUndefined();
  });
});

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: {},
  },
});

function makeDoc(paragraphs: string[]) {
  return schema.node(
    "doc",
    null,
    paragraphs.map((text) => schema.node("paragraph", null, text ? [schema.text(text)] : []))
  );
}

describe("plainTextRangeToPMRange", () => {
  it("maps a plain-text offset range within a single paragraph to PM positions", () => {
    const doc = makeDoc(["hello world"]);
    const range = plainTextRangeToPMRange(doc, 6, 11);
    expect(range).not.toBeNull();
    expect(doc.textBetween(range!.from, range!.to)).toBe("world");
  });

  it("maps a range spanning multiple paragraphs", () => {
    const doc = makeDoc(["foo", "bar"]);
    // flattened plain text is "foobar" (no separator between blocks)
    const range = plainTextRangeToPMRange(doc, 2, 5);
    expect(range).not.toBeNull();
    expect(doc.textBetween(range!.from, range!.to, "")).toBe("oba");
  });

  it("returns null when the start offset is past the end of the document", () => {
    const doc = makeDoc(["short"]);
    const range = plainTextRangeToPMRange(doc, 100, 105);
    expect(range).toBeNull();
  });

  it("clamps a stale span whose end extends past the current document length", () => {
    const doc = makeDoc(["hi"]);
    const range = plainTextRangeToPMRange(doc, 0, 50);
    expect(range).not.toBeNull();
    expect(doc.textBetween(range!.from, range!.to)).toBe("hi");
  });
});
