import { describe, it, expect } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { plainTextRangeToPMRange } from "./authorshipHighlight";

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
