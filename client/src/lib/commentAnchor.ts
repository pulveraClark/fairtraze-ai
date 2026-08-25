import * as Y from "yjs";
import { ySyncPluginKey, absolutePositionToRelativePosition, relativePositionToAbsolutePosition } from "@tiptap/y-tiptap";
import type { EditorState } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

// @tiptap/y-tiptap defines but doesn't re-export ProsemirrorMapping from its package root;
// mirrored here structurally (Map<Y.AbstractType, PMNode | PMNode[]>) to type ySyncPluginKey's
// state without reaching into the package's internal /dist/src paths.
type ProsemirrorMapping = Map<Y.AbstractType<unknown>, PMNode | PMNode[]>;

// Anchors a comment to a range of the shared Y.XmlFragment using Yjs's own RelativePosition —
// which stays correctly anchored to its content as other users concurrently edit the document,
// unlike a raw integer offset pair, which would silently drift. Built entirely from
// @tiptap/y-tiptap's public position-mapping API (ySyncPluginKey, absolutePositionToRelativePosition,
// relativePositionToAbsolutePosition) — the same mechanism @tiptap/extension-collaboration itself
// uses internally, not a reimplementation. The encoded anchor is opaque to the server (see
// server/src/routes/comments.ts) — created and resolved only here, client-side.

export interface CommentAnchorRange {
  start: number;
  end: number;
}

interface YSyncState {
  type: Y.XmlFragment;
  doc: Y.Doc;
  binding?: { mapping: ProsemirrorMapping };
}

function getYSyncState(state: EditorState): YSyncState | null {
  return (ySyncPluginKey.getState(state) as YSyncState | undefined) ?? null;
}

// btoa/atob operate on Latin1 strings; encodeURIComponent/decodeURIComponent + escape/unescape is
// the standard workaround for round-tripping arbitrary UTF-8 JSON through them in the browser.
function utf8ToBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}
function base64ToUtf8(encoded: string): string {
  return decodeURIComponent(escape(atob(encoded)));
}

// Captures the current [from, to) ProseMirror range as a persistable anchor. Returns null if the
// editor isn't actually collaborative (no Yjs sync plugin bound) — comments require an EDITOR/
// COMBINED document, which always is.
export function encodeCommentAnchor(state: EditorState, from: number, to: number): string | null {
  const ystate = getYSyncState(state);
  if (!ystate?.binding) return null;
  const startRel = absolutePositionToRelativePosition(from, ystate.type, ystate.binding.mapping);
  const endRel = absolutePositionToRelativePosition(to, ystate.type, ystate.binding.mapping);
  const json = {
    start: Y.relativePositionToJSON(startRel),
    end: Y.relativePositionToJSON(endRel),
  };
  return utf8ToBase64(JSON.stringify(json));
}

// Resolves a stored anchor against the CURRENT document state. Returns null if the anchored text
// no longer exists — callers must treat this as the documented "known limitation" (keep the
// comment visible in the side panel without an inline highlight), not as an error.
//
// Yjs's RelativePosition does NOT reliably return null just because the exact anchored character
// was deleted — confirmed by commentAnchor.test.ts: it commonly resolves gracefully to a
// zero-width position near where the deleted content used to be (start === end), rather than
// failing outright. `null` is normalized here for both cases (a genuinely unresolvable position,
// and a collapsed range) so callers only ever need one check, instead of also having to know
// about this Yjs-specific "collapsed but not null" nuance themselves.
export function decodeCommentAnchor(state: EditorState, encoded: string): CommentAnchorRange | null {
  const ystate = getYSyncState(state);
  if (!ystate?.binding) return null;

  let parsed: { start: unknown; end: unknown };
  try {
    parsed = JSON.parse(base64ToUtf8(encoded)) as { start: unknown; end: unknown };
  } catch {
    return null;
  }

  const startRel = Y.createRelativePositionFromJSON(parsed.start);
  const endRel = Y.createRelativePositionFromJSON(parsed.end);
  const start = relativePositionToAbsolutePosition(ystate.doc, ystate.type, startRel, ystate.binding.mapping);
  const end = relativePositionToAbsolutePosition(ystate.doc, ystate.type, endRel, ystate.binding.mapping);
  if (start === null || end === null) return null;

  const from = Math.min(start, end);
  const to = Math.max(start, end);
  if (to <= from) return null;

  return { start: from, end: to };
}
