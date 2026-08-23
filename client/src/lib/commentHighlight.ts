import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

// Same principle as authorshipHighlight.ts (and its own comment there): a non-intrusive
// ProseMirror decoration, not real document content — it never touches the Yjs/TipTap document
// schema. Ranges are pre-resolved ProseMirror positions (see client/src/lib/commentAnchor.ts),
// so unlike authorshipHighlight this plugin does no offset mapping of its own — it just renders.

export interface CommentDecorationRange {
  commentId: number;
  from: number;
  to: number;
  resolved: boolean;
}

export const commentHighlightPluginKey = new PluginKey<DecorationSet>("commentHighlight");

function buildDecorations(doc: PMNode, ranges: CommentDecorationRange[] | null): DecorationSet {
  if (!ranges || ranges.length === 0) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  for (const r of ranges) {
    if (r.to <= r.from) continue;
    decorations.push(
      Decoration.inline(r.from, r.to, {
        class: r.resolved ? "ft-comment-highlight ft-comment-highlight-resolved" : "ft-comment-highlight",
        "data-comment-id": String(r.commentId),
      })
    );
  }
  return DecorationSet.create(doc, decorations);
}

export const CommentHighlight = Extension.create<{ onCommentClick?: (commentId: number) => void }>({
  name: "commentHighlight",

  addOptions() {
    return { onCommentClick: undefined };
  },

  addProseMirrorPlugins() {
    const onCommentClick = this.options.onCommentClick;

    return [
      new Plugin<DecorationSet>({
        key: commentHighlightPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const update = tr.getMeta(commentHighlightPluginKey) as CommentDecorationRange[] | null | undefined;
            if (update !== undefined) {
              return buildDecorations(tr.doc, update);
            }
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return commentHighlightPluginKey.getState(state);
          },
          handleClick(_view, _pos, event) {
            if (!onCommentClick) return false;
            const target = event.target as HTMLElement | null;
            const el = target?.closest("[data-comment-id]");
            const idAttr = el?.getAttribute("data-comment-id");
            if (!idAttr) return false;
            onCommentClick(Number(idAttr));
            return true;
          },
        },
      }),
    ];
  },
});
