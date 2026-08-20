import mammoth from "mammoth";
import { parse as parseHtml, NodeType } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";
import { getYDoc } from "y-websocket/bin/utils";
import { Y } from "./yjsCjs.js";
import type { ImportOrigin } from "./authorshipCapture.js";

export type DocxChunkKind = "heading" | "paragraph" | "listItem";

export interface DocxChunk {
  kind: DocxChunkKind;
  level?: number;                          // 1-6, heading chunks only
  listType?: "bulletList" | "orderedList"; // listItem chunks only
  text: string;
}

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function collapseWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

// Structural-only: extracts headings/paragraphs/list items with their text, discarding inline
// formatting (bold/italic/etc. from mammoth's HTML) — the chunker only needs paragraph-level
// structure to attribute authorship correctly, not full document-formatting fidelity. Nested
// sub-lists inside a <li> are not specially handled; their text is flattened into the parent
// list item's text via .text (a documented simplification, not a bug).
export async function parseDocxToChunks(buffer: Buffer): Promise<DocxChunk[]> {
  const result = await mammoth.convertToHtml({ buffer });
  const root = parseHtml(result.value);
  const chunks: DocxChunk[] = [];

  for (const node of root.childNodes) {
    if (node.nodeType !== NodeType.ELEMENT_NODE) continue;
    const el = node as unknown as HTMLElement;
    const tagName = el.tagName?.toLowerCase();
    if (!tagName) continue;

    if (HEADING_TAGS.has(tagName)) {
      const text = collapseWhitespace(el.text);
      if (text) chunks.push({ kind: "heading", level: Number(tagName[1]), text });
    } else if (tagName === "p") {
      const text = collapseWhitespace(el.text);
      if (text) chunks.push({ kind: "paragraph", text });
    } else if (tagName === "ul" || tagName === "ol") {
      const listType = tagName === "ul" ? "bulletList" : "orderedList";
      for (const li of el.querySelectorAll("li")) {
        const text = collapseWhitespace(li.text);
        if (text) chunks.push({ kind: "listItem", listType, text });
      }
    }
    // Other top-level tags (tables, images, etc.) are not modeled by this editor's schema and
    // are silently skipped — same "known measurement limitation" pattern as the rest of the
    // editor scoring model (see CLAUDE.md's "Known Editor-Scoring Limitations").
  }

  return chunks;
}

// Thrown when the chunk loop fails partway through — importedCount tells the caller (and via it,
// the end user) how many chunks were ALREADY applied to the live ydoc before the failure, since
// Yjs never rolls back an already-applied transact(). A generic error here would misleadingly
// read as "nothing happened" when partial content may already be visible in the document.
export class DocxImportPartialFailureError extends Error {
  constructor(public readonly importedCount: number, public readonly totalCount: number, cause: unknown) {
    super(`Import failed after ${importedCount} of ${totalCount} section(s) were already added.`);
    this.cause = cause;
  }
}

// Gets the room's LIVE Y.Doc via the same getYDoc() y-websocket/bin/utils' own
// setupWSConnection() uses internally — not a fresh disconnected copy. If the room is already in
// memory (someone has the editor open), this returns that exact instance, so each transact()
// below broadcasts to any connected client via the existing update -> doc.conns wiring, same as
// live typing. If the room isn't in memory yet, getYDoc() creates it and calls
// persistence.bindState() (yjsPersistence.bindState), the same restore + attachAuthorshipTracking
// registration path already used by real WebSocket connections.
//
// Known limitation (documented in CLAUDE.md): if no WebSocket ever attaches to a room created
// this way, the resulting WSSharedDoc is never evicted from y-websocket's in-memory `docs` map —
// eviction only happens inside that library's private closeConn, gated on a connection closing.
export async function importDocxIntoRoom(
  groupId: number,
  userId: number,
  chunks: DocxChunk[]
): Promise<{ chunkCount: number }> {
  const room = `group-doc-${groupId}`;
  const ydoc = getYDoc(room, true);
  const fragment = ydoc.getXmlFragment("default");
  const importOrigin: ImportOrigin = { type: "import", userId };

  let imported = 0;
  try {
    for (const chunk of chunks) {
      ydoc.transact(() => {
        const node = buildNode(chunk);
        fragment.insert(fragment.length, [node]);
      }, importOrigin);
      imported++;
    }
  } catch (err) {
    throw new DocxImportPartialFailureError(imported, chunks.length, err);
  }

  return { chunkCount: imported };
}

function textNode(text: string) {
  const t = new Y.XmlText();
  t.insert(0, text);
  return t;
}

// Mirrors @tiptap/y-tiptap's own node -> Y.XmlElement construction (createTypeFromElementNode in
// y-tiptap.js): `new Y.XmlElement(node.type.name)` + `type.setAttribute(key, rawValue)` for each
// ProseMirror attr, so these hand-built nodes are indistinguishable to TipTap/collaboration from
// ones a real editing session would have produced.
function buildNode(chunk: DocxChunk) {
  if (chunk.kind === "heading") {
    const el = new Y.XmlElement("heading");
    // Yjs's XmlElement<KV> generic defaults attribute values to `string`, but at runtime
    // attributes are stored as arbitrary JSON-serializable values — y-tiptap's own
    // createTypeFromElementNode (dist/y-tiptap.js:1028) passes raw ProseMirror attr values
    // (numbers included) through setAttribute() the same way. TipTap's heading node expects a
    // numeric `level` attr, so we match that, not the overly-narrow default generic.
    el.setAttribute("level", (chunk.level ?? 1) as unknown as string);
    el.insert(0, [textNode(chunk.text)]);
    return el;
  }
  if (chunk.kind === "listItem") {
    const listEl = new Y.XmlElement(chunk.listType === "orderedList" ? "orderedList" : "bulletList");
    const itemEl = new Y.XmlElement("listItem");
    const paraEl = new Y.XmlElement("paragraph");
    paraEl.insert(0, [textNode(chunk.text)]);
    itemEl.insert(0, [paraEl]);
    listEl.insert(0, [itemEl]);
    return listEl;
  }
  const el = new Y.XmlElement("paragraph");
  el.insert(0, [textNode(chunk.text)]);
  return el;
}
