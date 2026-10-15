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

// ── Page break, page setup, headers and footers ───────────────────────────────────────────────────

function buildBreakYjsState(): Uint8Array {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("default");
  const para = (text: string) => {
    const p = new Y.XmlElement("paragraph");
    const t = new Y.XmlText();
    t.insert(0, text);
    p.insert(0, [t]);
    return p;
  };
  const cellPara = para("cell");
  const cell = new Y.XmlElement("tableCell");
  cell.insert(0, [cellPara]);
  const row = new Y.XmlElement("tableRow");
  row.insert(0, [cell]);
  const table = new Y.XmlElement("table");
  table.insert(0, [row]);
  ydoc.transact(() => {
    fragment.insert(0, [
      para("one"),
      new Y.XmlElement("pageBreak"),
      para("two"),
      new Y.XmlElement("pageBreak"),
      new Y.XmlElement("pageBreak"), // two in a row
      para("three"),
      new Y.XmlElement("pageBreak"),
      table, // a break right before a table
      new Y.XmlElement("pageBreak"), // and one at the very end
    ]);
  });
  return Y.encodeStateAsUpdate(ydoc);
}

const baseLayout = {
  pageSize: "SHORT" as const,
  orientation: "PORTRAIT" as const,
  marginPreset: "NORMAL" as const,
  header: { left: "", center: "", right: "" },
  footer: { left: "", center: "", right: "" },
};

async function unzip(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const text = async (name: string) => zip.file(name)!.async("string");
  const names = Object.keys(zip.files);
  return { zip, text, names };
}

describe("documentExport - page break", () => {
  it("reads page breaks as blocks and adds no text", () => {
    const blocks = readDocumentStructure({ content: "{}", yjsState: buildBreakYjsState() });
    expect(blocks.filter((b) => b.kind === "pageBreak")).toHaveLength(5);
    const text = blocks.flatMap((b) => (b.kind === "paragraph" ? b.runs.map((r) => r.text) : [])).join("");
    expect(text).toBe("onetwothree");
  });

  it("exports a break as pageBreakBefore on the next paragraph - no stray empty line, a blank page for two in a row", async () => {
    const blocks = readDocumentStructure({ content: "{}", yjsState: buildBreakYjsState() });
    const { text } = await unzip(await buildDocxBuffer(blocks, []));
    const xml = await text("word/document.xml");
    const paragraphs = xml.match(/<w:p>.*?<\/w:p>|<w:p\/>/g) ?? [];
    const withBreak = paragraphs.filter((p) => p.includes("<w:pageBreakBefore"));
    // "two" and "three" carry it themselves, plus: one extra for the 2nd of two breaks in a row,
    // one lead paragraph before the table, and one for the trailing break.
    expect(withBreak).toHaveLength(5);
    expect(withBreak.some((p) => p.includes(">two<"))).toBe(true);
    expect(withBreak.some((p) => p.includes(">three<"))).toBe(true);
    // The very first paragraph does not break.
    expect(paragraphs[0]).not.toContain("pageBreakBefore");
    expect(xml).not.toContain("<w:br w:type=\"page\"/>"); // no lone break characters
  });

  it("a document without breaks has no pageBreakBefore", async () => {
    const blocks = readDocumentStructure({ content: "{}", yjsState: buildSampleYjsState() });
    const { text } = await unzip(await buildDocxBuffer(blocks, []));
    expect(await text("word/document.xml")).not.toContain("pageBreakBefore");
  });

  it("does not leak a pending break from one export into the next", async () => {
    const withTrailing = readDocumentStructure({ content: "{}", yjsState: buildBreakYjsState() });
    await buildDocxBuffer(withTrailing, []);
    const plain = readDocumentStructure({ content: "{}", yjsState: buildSampleYjsState() });
    const { text } = await unzip(await buildDocxBuffer(plain, []));
    expect(await text("word/document.xml")).not.toContain("pageBreakBefore");
  });
});

describe("documentExport - page setup", () => {
  const blocks = () => readDocumentStructure({ content: "{}", yjsState: buildSampleYjsState() });
  const sect = async (layout: typeof baseLayout) => {
    const { text } = await unzip(await buildDocxBuffer(blocks(), [], layout));
    const xml = await text("word/document.xml");
    const pg = /<w:pgSz w:w="(\d+)" w:h="(\d+)"(?: w:orient="(\w+)")?/.exec(xml)!;
    const mar = /<w:pgMar w:top="(\d+)" w:right="(\d+)" w:bottom="(\d+)" w:left="(\d+)"/.exec(xml)!;
    return { w: +pg[1]!, h: +pg[2]!, orient: pg[3], top: +mar[1]!, right: +mar[2]!, bottom: +mar[3]!, left: +mar[4]! };
  };

  it("sets the paper size for all three sizes, portrait", async () => {
    expect(await sect({ ...baseLayout, pageSize: "SHORT" })).toMatchObject({ w: 12240, h: 15840 });
    expect(await sect({ ...baseLayout, pageSize: "LONG" })).toMatchObject({ w: 12240, h: 18720 });
    expect(await sect({ ...baseLayout, pageSize: "A4" })).toMatchObject({ w: 11906, h: 16838 });
  });

  it("landscape swaps width and height and says so", async () => {
    for (const [size, w, h] of [["SHORT", 15840, 12240], ["LONG", 18720, 12240], ["A4", 16838, 11906]] as const) {
      const s = await sect({ ...baseLayout, pageSize: size, orientation: "LANDSCAPE" });
      expect(s, size).toMatchObject({ w, h, orient: "landscape" });
      expect(s.w).toBeGreaterThan(s.h);
    }
  });

  it("applies the three margin presets in twips", async () => {
    expect(await sect({ ...baseLayout, marginPreset: "NORMAL" })).toMatchObject({ top: 1440, bottom: 1440, left: 1440, right: 1440 });
    expect(await sect({ ...baseLayout, marginPreset: "NARROW" })).toMatchObject({ top: 720, bottom: 720, left: 720, right: 720 });
    expect(await sect({ ...baseLayout, marginPreset: "WIDE" })).toMatchObject({ top: 1440, bottom: 1440, left: 2880, right: 2880 });
  });

  it("without a layout the export is unchanged (valid, no header or footer part)", async () => {
    const { names } = await unzip(await buildDocxBuffer(blocks(), []));
    expect(names.some((n) => /word\/(header|footer)\d+\.xml/.test(n))).toBe(false);
  });
});

describe("documentExport - headers and footers", () => {
  const blocks = () => readDocumentStructure({ content: "{}", yjsState: buildSampleYjsState() });
  const parts = async (layout: typeof baseLayout) => {
    const { text, names } = await unzip(await buildDocxBuffer(blocks(), [], layout));
    const header = names.find((n) => /^word\/header\d+\.xml$/.test(n));
    const footer = names.find((n) => /^word\/footer\d+\.xml$/.test(n));
    return { header: header ? await text(header) : null, footer: footer ? await text(footer) : null };
  };

  it("adds no header or footer when every slot is empty", async () => {
    expect(await parts(baseLayout)).toEqual({ header: null, footer: null });
  });

  it("writes left, centre and right text with centre and right tab stops, and a PAGE field for {page}", async () => {
    const { header, footer } = await parts({
      ...baseLayout,
      header: { left: "Group 4", center: "Capstone", right: "Page {page}" },
      footer: { left: "", center: "{page}", right: "" },
    });
    expect(header).toContain("Group 4");
    expect(header).toContain("Capstone");
    expect(header).toContain("Page ");
    expect(header).toContain("PAGE"); // the page-number field
    expect(header).toContain('w:val="center"');
    expect(header).toContain('w:val="right"');
    // Text width = 8.5in - 2in margins = 6.5in = 9360 twips: centre at 4680, right at 9360.
    expect(header).toContain('w:pos="4680"');
    expect(header).toContain('w:pos="9360"');
    expect(footer).toContain("PAGE");
  });

  it("is plain text: markup typed into a slot stays literal text", async () => {
    const { header } = await parts({ ...baseLayout, header: { left: "<b>x</b> & y", center: "", right: "" } });
    expect(header).toContain("&lt;b&gt;x&lt;/b&gt; &amp; y");
    expect(header).not.toContain("<b>x</b>");
  });

  it("tab stops follow the page: landscape and wide margins", async () => {
    const { header } = await parts({
      ...baseLayout,
      orientation: "LANDSCAPE",
      marginPreset: "WIDE",
      header: { left: "L", center: "C", right: "R" },
    });
    // 11in - 4in = 7in = 10080 twips.
    expect(header).toContain('w:pos="5040"');
    expect(header).toContain('w:pos="10080"');
  });

  it("only-centre text still gets its tab (no left text before it)", async () => {
    const { header } = await parts({ ...baseLayout, header: { left: "", center: "Only", right: "" } });
    expect(header).toContain("Only");
    expect(header).toContain("<w:tab/>");
  });
});
