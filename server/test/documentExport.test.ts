import { describe, it, expect } from "vitest";
import JSZip from "jszip";
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

// ── Editor tools (strike, justify, indent, checklist, horizontal line, links, nested lists) ──────

function buildToolsYjsState(): Uint8Array {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("default");
  const para = (text: string, attrs: Record<string, unknown> = {}, formats: Array<[number, number, Record<string, unknown>]> = []) => {
    const p = new Y.XmlElement("paragraph");
    for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v as string);
    const t = new Y.XmlText();
    t.insert(0, text);
    for (const [from, len, attrs2] of formats) t.format(from, len, attrs2);
    p.insert(0, [t]);
    return p;
  };

  ydoc.transact(() => {
    const justified = para("Justified text", { textAlign: "justify" });
    const indented = para("Indented twice", { indent: 2 });
    const struck = para("Struck out", {}, [[0, 6, { strike: true }]]);
    const linked = para("Safe link and bad link", {}, [
      [0, 9, { link: { href: "https://example.com/page" } }],
      [14, 8, { link: { href: "javascript:alert(1)" } }],
    ]);

    const taskList = new Y.XmlElement("taskList");
    const done = new Y.XmlElement("taskItem");
    done.setAttribute("checked", true as unknown as string);
    done.insert(0, [para("Done item")]);
    const open = new Y.XmlElement("taskItem");
    open.setAttribute("checked", false as unknown as string);
    open.insert(0, [para("Open item")]);
    taskList.insert(0, [done, open]);

    const rule = new Y.XmlElement("horizontalRule");

    // bulletList > listItem(outer) > [paragraph, bulletList > listItem(inner) > paragraph]
    const inner = new Y.XmlElement("listItem");
    inner.insert(0, [para("Inner point")]);
    const innerList = new Y.XmlElement("bulletList");
    innerList.insert(0, [inner]);
    const outer = new Y.XmlElement("listItem");
    outer.insert(0, [para("Outer point"), innerList]);
    const outerList = new Y.XmlElement("bulletList");
    outerList.insert(0, [outer]);

    fragment.insert(0, [justified, indented, struck, linked, taskList, rule, outerList]);
  });
  return Y.encodeStateAsUpdate(ydoc);
}

describe("documentExport — editor tools", () => {
  it("reads justify, indent, strike, task items, horizontal line and only safe links", () => {
    const blocks = readDocumentStructure({ content: "{}", yjsState: buildToolsYjsState() });
    expect(blocks[0]).toMatchObject({ kind: "paragraph", align: "justify" });
    expect(blocks[1]).toMatchObject({ kind: "paragraph", indent: 2 });
    expect(blocks[2].kind === "paragraph" && blocks[2].runs.some((r) => r.strike && r.text === "Struck")).toBe(true);
    if (blocks[3].kind === "paragraph") {
      const links = blocks[3].runs.map((r) => r.link).filter(Boolean);
      expect(links).toEqual(["https://example.com/page"]); // the javascript: href is dropped
    }
    expect(blocks[4]).toMatchObject({ kind: "taskItem", checked: true });
    expect(blocks[5]).toMatchObject({ kind: "taskItem", checked: false });
    expect(blocks[6]).toEqual({ kind: "rule" });
    expect(blocks[7]).toMatchObject({ kind: "listItem", listType: "bulletList" });
  });

  it("writes them into the .docx: justify, strike, indent, hyperlink, checkboxes, rule, nested list level", async () => {
    const blocks = readDocumentStructure({ content: "{}", yjsState: buildToolsYjsState() });
    const buffer = await buildDocxBuffer(blocks, []);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")!.async("string");
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");

    expect(xml).toContain('<w:jc w:val="both"');
    expect(xml).toContain("<w:strike");
    expect(xml).toMatch(/<w:ind w:left="1440"/); // indent 2 x 720 twips
    expect(xml).toContain("<w:hyperlink");
    expect(rels).toContain("https://example.com/page");
    expect(xml + rels).not.toContain("javascript:");
    // The ballot box is its own run, immediately followed by the item text.
    expect(xml).toContain(`>${String.fromCharCode(0x2611)} </w:t></w:r>`);
    expect(xml).toContain(`>${String.fromCharCode(0x2610)} </w:t></w:r>`);
    expect(xml).toContain("Done item");
    expect(xml).toContain("Open item");
    expect(xml).toContain("<w:pBdr>"); // horizontal line as a bottom border
    expect(xml).toContain('<w:ilvl w:val="1"/>'); // nested bullet one level deeper
  });
});
