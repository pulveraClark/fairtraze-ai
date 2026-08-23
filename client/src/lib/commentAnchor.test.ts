import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import * as Y from "yjs";
import { encodeCommentAnchor, decodeCommentAnchor } from "./commentAnchor";

// Builds a headless (no React) TipTap editor bound to a real Yjs document — the same
// Collaboration extension DocumentEditor.tsx uses — so encodeCommentAnchor/decodeCommentAnchor
// exercise the real ySyncPlugin state, not a mock.
function makeCollabEditor(ydoc: Y.Doc) {
  return new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit.configure({ undoRedo: false }), Collaboration.configure({ document: ydoc })],
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
});
