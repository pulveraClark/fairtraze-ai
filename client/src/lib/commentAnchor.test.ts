import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import * as Y from "yjs";
import { encodeCommentAnchor, decodeCommentAnchor } from "./commentAnchor";

// Builds a headless (no React) TipTap editor bound to a real Yjs document — the same
// Collaboration extension DocumentEditor.tsx uses — so encodeCommentAnchor/decodeCommentAnchor
// exercise the real ySyncPlugin state, not a mock.
function makeCollabEditor(ydoc: Y.Doc) {
  return new Editor({
    element: document.createElement("div"),
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document: ydoc }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
    ],
  });
}

describe("commentAnchor round-trip", () => {
  it("resolves back to the same text immediately after encoding", () => {
    const ydoc = new Y.Doc();
    const editor = makeCollabEditor(ydoc);
    editor.commands.insertContent("Hello brave new world.");

    const from = editor.state.doc.textContent.indexOf("brave") + 1; // +1 for the doc's leading node offset
    const to = from + "brave".length;
    const anchor = encodeCommentAnchor(editor.state, from, to);
    expect(anchor).not.toBeNull();

    const resolved = decodeCommentAnchor(editor.state, anchor!);
    expect(resolved).not.toBeNull();
    expect(editor.state.doc.textBetween(resolved!.start, resolved!.end)).toBe("brave");

    editor.destroy();
  });

  it("stays anchored to the same word after a concurrent edit elsewhere in the document", () => {
    const ydoc = new Y.Doc();
    const editor = makeCollabEditor(ydoc);
    editor.commands.insertContent("Hello brave new world.");

    const from = editor.state.doc.textContent.indexOf("brave") + 1;
    const to = from + "brave".length;
    const anchor = encodeCommentAnchor(editor.state, from, to);
    expect(anchor).not.toBeNull();

    // Simulate a concurrent edit from another connected client: a second Y.Doc, synced via
    // Y.applyUpdate (mirroring what y-websocket actually does over the wire), inserts text
    // BEFORE "brave" — a raw offset anchor would now point at the wrong word.
    const peerDoc = new Y.Doc();
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(ydoc));
    const fragment = peerDoc.getXmlFragment("default");
    const paragraph = fragment.get(0) as Y.XmlText | Y.XmlElement;
    if (paragraph instanceof Y.XmlText) {
      paragraph.insert(0, "PREFIX ");
    } else {
      // @tiptap/y-tiptap wraps text in a paragraph XmlElement; get its first XmlText child.
      const textNode = paragraph.toArray()[0] as Y.XmlText;
      textNode.insert(0, "PREFIX ");
    }
    const update = Y.encodeStateAsUpdate(peerDoc);
    Y.applyUpdate(ydoc, update);

    const resolved = decodeCommentAnchor(editor.state, anchor!);
    expect(resolved).not.toBeNull();
    expect(editor.state.doc.textBetween(resolved!.start, resolved!.end)).toBe("brave");

    editor.destroy();
  });

  it("returns null once the anchored text has been deleted entirely", () => {
    const ydoc = new Y.Doc();
    const editor = makeCollabEditor(ydoc);
    editor.commands.insertContent("Hello brave new world.");

    const from = editor.state.doc.textContent.indexOf("brave") + 1;
    const to = from + "brave".length;
    const anchor = encodeCommentAnchor(editor.state, from, to);
    expect(anchor).not.toBeNull();

    editor.commands.deleteRange({ from, to });

    const resolved = decodeCommentAnchor(editor.state, anchor!);
    expect(resolved).toBeNull();

    editor.destroy();
  });

  it("anchors correctly to text inside a table cell and survives a concurrent edit elsewhere", () => {
    const ydoc = new Y.Doc();
    const editor = makeCollabEditor(ydoc);
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    // insertTable seeds each cell empty; select the second data-row's first cell and type into it.
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent("brave new cell text");

    const text = editor.state.doc.textContent;
    const idx = text.indexOf("brave");
    expect(idx).toBeGreaterThanOrEqual(0);

    // Walk the doc to find the ProseMirror position corresponding to that text index (accounts
    // for node-boundary offsets the same way the rest of this test file already does above).
    let pos = -1;
    editor.state.doc.descendants((node, nodePos) => {
      if (pos !== -1 || !node.isText) return;
      const nodeText = node.text ?? "";
      if (nodeText.includes("brave")) {
        pos = nodePos + nodeText.indexOf("brave");
      }
    });
    expect(pos).toBeGreaterThanOrEqual(0);
    const to = pos + "brave".length;

    const anchor = encodeCommentAnchor(editor.state, pos, to);
    expect(anchor).not.toBeNull();
    expect(editor.state.doc.textBetween(pos, to)).toBe("brave");

    // Concurrent edit from another client, typing into the FIRST cell (unrelated to the anchor) —
    // mirrors the existing "stays anchored... elsewhere" test above, now with table structure.
    const peerDoc = new Y.Doc();
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(ydoc));
    const fragment = peerDoc.getXmlFragment("default");
    const table = fragment.get(0) as Y.XmlElement;
    const firstRow = table.toArray()[0] as Y.XmlElement;
    const firstHeaderCell = firstRow.toArray()[0] as Y.XmlElement;
    const firstPara = firstHeaderCell.toArray()[0] as Y.XmlElement;
    const firstText = firstPara.toArray()[0] as Y.XmlText | undefined;
    if (firstText) {
      firstText.insert(0, "unrelated edit ");
    } else {
      firstPara.insert(0, [(() => {
        const t = new Y.XmlText();
        t.insert(0, "unrelated edit ");
        return t;
      })()]);
    }
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(peerDoc));

    const resolved = decodeCommentAnchor(editor.state, anchor!);
    expect(resolved).not.toBeNull();
    expect(editor.state.doc.textBetween(resolved!.start, resolved!.end)).toBe("brave");

    editor.destroy();
  });
});
