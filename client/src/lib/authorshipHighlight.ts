import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { getUserColor } from "./collabColors";

// Same principle as the CollaborationCursor fix: this is a non-intrusive ProseMirror
// decoration, not real document content — it never touches the Yjs/TipTap document schema.

export interface AuthorshipSpan {
  userId: number;
  start: number; // flattened plain-text offset, inclusive
  end: number; // exclusive
}

export interface AuthorshipUser {
  id: number;
  name: string;
}

export interface AuthorshipUpdate {
  spans: AuthorshipSpan[];
  users: AuthorshipUser[];
}

export const authorshipPluginKey = new PluginKey<DecorationSet>("authorshipHighlight");

// The server's spans are offsets into a flattened plain-text view of the document (concatenated
// text-node content, no separator between blocks — the same convention as ProseMirror's own
// `doc.textContent`). There's no built-in ProseMirror helper for this direction (offset -> pos);
// `textBetween`/`textContent` only go the other way. So we walk the doc ourselves, keeping a
// running plain-text counter alongside each node's real position.
export function plainTextRangeToPMRange(doc: PMNode, start: number, end: number): { from: number; to: number } | null {
  let textOffset = 0;
  let from = -1;
  let to = -1;
  let lastTextEndPos = 0;

  doc.descendants((node, pos) => {
    if (to !== -1) return false;
    if (!node.isText || !node.text) return true;

    const nodeStart = textOffset;
    const nodeEnd = textOffset + node.text.length;

    if (from === -1 && end > nodeStart && start < nodeEnd) {
      from = pos + Math.max(0, start - nodeStart);
    }
    if (from !== -1 && end <= nodeEnd) {
      to = pos + Math.max(0, end - nodeStart);
    }

    textOffset = nodeEnd;
    lastTextEndPos = pos + node.text.length;
    return true;
  });

  if (from === -1) return null;
  // The span extends past the last text node we saw (e.g. a stale span from just before a
  // teammate's edit) — clamp to the document's current end rather than dropping the span.
  if (to === -1) to = lastTextEndPos;
  return { from, to: Math.max(from, to) };
}

function buildDecorations(doc: PMNode, update: AuthorshipUpdate | null): DecorationSet {
  if (!update || update.spans.length === 0) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  for (const span of update.spans) {
    const range = plainTextRangeToPMRange(doc, span.start, span.end);
    if (!range || range.to <= range.from) continue;
    const color = getUserColor(span.userId);
    decorations.push(
      Decoration.inline(range.from, range.to, {
        style: `background-color: ${color}33;`,
      })
    );
  }
  return DecorationSet.create(doc, decorations);
}

export const AuthorshipHighlight = Extension.create({
  name: "authorshipHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: authorshipPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const update = tr.getMeta(authorshipPluginKey) as AuthorshipUpdate | null | undefined;
            if (update !== undefined) {
              return buildDecorations(tr.doc, update);
            }
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return authorshipPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});
