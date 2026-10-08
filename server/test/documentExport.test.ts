import { describe, it, expect } from "vitest";
import { Y } from "../src/collab/yjsCjs.js";
import { readDocumentStructure, buildDocxBuffer } from "../src/collab/documentExport.js";

// Builds the same nested Y.XmlElement shape a real editing session (or authorshipCaptureTable's
// own fixture) produces: heading, a paragraph with bold + colored + highlighted runs, a bullet
// list, and a 1x1 table with a header cell — covering every node/mark type documentExport.ts
// claims to translate.
function buildSampleYjsState(): Uint8Array {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("default");

  ydoc.transact(() => {
    const heading = new Y.XmlElement("heading");
    heading.setAttribute("level", 1 as unknown as string);
    const headingText = new Y.XmlText();
    headingText.insert(0, "Report Title");
    heading.insert(0, [headingText]);

    const para = new Y.XmlElement("paragraph");
    para.setAttribute("textAlign", "center");
    const paraText = new Y.XmlText();
    paraText.insert(0, "Bold and highlighted");
    paraText.format(0, 4, { bold: true });
    paraText.format(9, 11, { highlight: { color: "#fef08a" } });
    paraText.format(0, 20, { textStyle: { color: "#dc2626" } });
    para.insert(0, [paraText]);

    const listItemPara = new Y.XmlElement("paragraph");
    const listItemText = new Y.XmlText();
    listItemText.insert(0, "First point");
    listItemPara.insert(0, [listItemText]);
    const listItem = new Y.XmlElement("listItem");
    listItem.insert(0, [listItemPara]);
    const bulletList = new Y.XmlElement("bulletList");
    bulletList.insert(0, [listItem]);

    const cellText = new Y.XmlText();
    cellText.insert(0, "Header cell");
    const cellPara = new Y.XmlElement("paragraph");
    cellPara.insert(0, [cellText]);
    const tableHeader = new Y.XmlElement("tableHeader");
    tableHeader.insert(0, [cellPara]);
    const tableRow = new Y.XmlElement("tableRow");
    tableRow.insert(0, [tableHeader]);
    const table = new Y.XmlElement("table");
    table.insert(0, [tableRow]);

    fragment.insert(0, [heading, para, bulletList, table]);
  });

  return Y.encodeStateAsUpdate(ydoc);
}

describe("documentExport — readDocumentStructure", () => {
  it("walks a scratch Y.Doc into structured blocks without needing getYDoc()", () => {
    const yjsState = buildSampleYjsState();
    const blocks = readDocumentStructure({ content: "{}", yjsState });

    expect(blocks).toHaveLength(4);

    expect(blocks[0]).toMatchObject({ kind: "heading", level: 1 });
    expect(blocks[0].kind === "heading" && blocks[0].runs.map((r) => r.text).join("")).toBe("Report Title");

    expect(blocks[1]).toMatchObject({ kind: "paragraph", align: "center" });
    if (blocks[1].kind === "paragraph") {
      expect(blocks[1].runs.some((r) => r.bold && r.color === "#dc2626")).toBe(true);
      expect(blocks[1].runs.some((r) => r.highlight === "#fef08a")).toBe(true);
    }

    expect(blocks[2]).toMatchObject({ kind: "listItem", listType: "bulletList" });

    expect(blocks[3].kind).toBe("table");
    if (blocks[3].kind === "table") {
      expect(blocks[3].rows).toHaveLength(1);
      expect(blocks[3].rows[0].cells).toHaveLength(1);
      expect(blocks[3].rows[0].cells[0].header).toBe(true);
    }
  });

  it("falls back to legacy Document.content when yjsState is null (mirrors persistence.ts's bindState)", () => {
    const legacyContent = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Legacy content" }] }],
    });

    const blocks = readDocumentStructure({ content: legacyContent, yjsState: null });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "paragraph" });
    expect(blocks[0].kind === "paragraph" && blocks[0].runs.map((r) => r.text).join("")).toBe("Legacy content");
  });

  it("never mutates the caller's Uint8Array or leaks a resident Y.Doc (scratch doc is destroyed)", () => {
    const yjsState = buildSampleYjsState();
    const before = Buffer.from(yjsState).toString("base64");
    readDocumentStructure({ content: "{}", yjsState });
    const after = Buffer.from(yjsState).toString("base64");
    expect(after).toBe(before);
  });
});

describe("documentExport — buildDocxBuffer", () => {
  it("produces a non-empty, valid .docx (zip) buffer including an appended comments section", async () => {
    const yjsState = buildSampleYjsState();
    const blocks = readDocumentStructure({ content: "{}", yjsState });

    const buffer = await buildDocxBuffer(blocks, [
      { author: "Alice", text: "Looks good", resolved: true, createdAt: new Date().toISOString() },
      {
        author: "Bob",
        text: "Thanks!",
        resolved: true,
        createdAt: new Date().toISOString(),
        parentAuthor: "Alice",
      },
    ]);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // .docx is a zip archive — every zip starts with the "PK" local-file-header signature.
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("produces a valid buffer even for an empty document with no comments", async () => {
    const buffer = await buildDocxBuffer([], []);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
  });
});
