import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import * as Y from "yjs";
import { PAGE_SIZES, PAGE_SIZE_KEYS, PAGE_MARGIN_PX } from "@shared/pageSizes";
import { paginationExtension, paginationSize } from "./pageLayout";

// Page layout must add 0 characters to anyone's authorship count. Layout is pure ProseMirror
// decorations/widgets + meta-only transactions, so it can never reach the Yjs document. This builds
// two identical collab editors on real Y.Docs — one WITH the pagination extension (and size
// switches), one without — drives the same edits through both, and asserts the shared document is
// identical and the pagination editor emitted no extra Yjs updates. (Server-side, the same
// guarantee is checked against the real capture pipeline in
// server/test/authorshipCapturePagination.test.ts.)
function makeEditor(ydoc: Y.Doc, withPagination: boolean) {
  return new Editor({
    element: document.createElement("div"),
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document: ydoc }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
      ...(withPagination ? [paginationExtension("SHORT", 24)] : []),
    ],
  });
}

function textChars(ydoc: Y.Doc): number {
  let n = 0;
  const walk = (node: Y.XmlFragment | Y.XmlElement | Y.XmlText) => {
    if (node instanceof Y.XmlText) {
      for (const op of node.toDelta()) if (typeof op.insert === "string") n += op.insert.length;
    } else {
      node.toArray().forEach((c) => walk(c as Y.XmlElement | Y.XmlText));
    }
  };
  walk(ydoc.getXmlFragment("default"));
  return n;
}

describe("page layout is invisible to authorship", () => {
  it("adds 0 characters and 0 Yjs updates, including across page-size switches", () => {
    const plainDoc = new Y.Doc();
    const pagedDoc = new Y.Doc();
    let plainUpdates = 0;
    let pagedUpdates = 0;
    plainDoc.on("update", () => plainUpdates++);
    pagedDoc.on("update", () => pagedUpdates++);

    const plain = makeEditor(plainDoc, false);
    const paged = makeEditor(pagedDoc, true);

    // Layout alone (mount + every size) must not write to the document.
    for (const key of PAGE_SIZE_KEYS) paged.chain().updatePageSize(paginationSize(key)).run();
    expect(pagedUpdates).toBe(0);

    const typed = "The quick brown fox jumps over the lazy dog. ".repeat(40);
    for (const ed of [plain, paged]) {
      ed.commands.insertContent(`<p>${typed}</p>`);
      ed.commands.insertContent("<p>second paragraph</p>");
    }
    paged.chain().updatePageSize(paginationSize("A4")).run();
    paged.chain().updatePageSize(paginationSize("LONG")).run();

    expect(pagedUpdates).toBe(plainUpdates);
    expect(textChars(pagedDoc)).toBe(textChars(plainDoc));
    expect(textChars(pagedDoc)).toBe(typed.length + "second paragraph".length);
    expect(pagedDoc.getXmlFragment("default").toString()).toBe(plainDoc.getXmlFragment("default").toString());

    plain.destroy();
    paged.destroy();
  });
});

describe("page sizes and margins", () => {
  it("defines Short, Long and A4 with a 1 inch default margin", () => {
    expect(PAGE_SIZES.SHORT).toMatchObject({ widthPx: 816, heightPx: 1056, cssWidth: "8.5in", cssHeight: "11in" });
    expect(PAGE_SIZES.LONG).toMatchObject({ widthPx: 816, heightPx: 1248, cssWidth: "8.5in", cssHeight: "13in" });
    expect(PAGE_SIZES.A4).toMatchObject({ widthPx: 794, heightPx: 1123, cssWidth: "210mm", cssHeight: "297mm" });
    expect(PAGE_MARGIN_PX).toBe(96);
    for (const key of PAGE_SIZE_KEYS) {
      expect(paginationSize(key)).toMatchObject({
        marginTop: 96, marginBottom: 96, marginLeft: 96, marginRight: 96,
        pageWidth: PAGE_SIZES[key].widthPx, pageHeight: PAGE_SIZES[key].heightPx,
      });
    }
  });

  it("adds no header, footer or page number of its own", () => {
    const ext = paginationExtension("SHORT", 0);
    expect(ext.options).toMatchObject({ headerLeft: "", headerRight: "", footerLeft: "", footerRight: "", pageGap: 0 });
  });
});
