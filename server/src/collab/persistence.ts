import { createRequire } from "module";
import type * as YTypes from "yjs";
import type * as PMTypes from "prosemirror-model";
import type { prosemirrorJSONToYXmlFragment as ProsemirrorJSONToYXmlFragmentType } from "@tiptap/y-tiptap";
import { prisma } from "../lib/prisma.js";
import { Y } from "./yjsCjs.js";
import { attachAuthorshipTracking } from "./authorshipCapture.js";

// prosemirror-model and @tiptap/y-tiptap are loaded via the same CJS `require` trick as `Y`
// (see yjsCjs.ts) — only used here for the one-time legacy-content migration below.
const require = createRequire(import.meta.url);
const { Schema } = require("prosemirror-model") as typeof PMTypes;
const { prosemirrorJSONToYXmlFragment } = require("@tiptap/y-tiptap") as {
  prosemirrorJSONToYXmlFragment: typeof ProsemirrorJSONToYXmlFragmentType;
};

// Mirrors the default @tiptap/starter-kit node/mark set used by DocumentEditor.tsx in Step 1.
// Only used to parse legacy Step-1 `content` JSON once, when a room has no yjsState yet.
// Exported so tests can validate content (e.g. document templates, shared/src/documentTemplates.ts)
// parses cleanly under this exact schema before it ever reaches bindState below.
export const legacySchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    heading: { attrs: { level: { default: 1 } }, group: "block", content: "inline*" },
    blockquote: { group: "block", content: "block+" },
    horizontalRule: { group: "block" },
    codeBlock: { group: "block", content: "text*", marks: "", code: true },
    hardBreak: { group: "inline", inline: true, selectable: false },
    bulletList: { group: "block", content: "listItem+" },
    orderedList: { group: "block", content: "listItem+", attrs: { start: { default: 1 } } },
    listItem: { content: "paragraph block*" },
  },
  marks: {
    bold: {},
    italic: {},
    strike: {},
    code: {},
  },
});

const DEBOUNCE_MS = 3000;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Tracks, per room, whether bindState's own restore (Document.findUnique + Y.applyUpdate below)
// has had the chance to run. writeState awaits this before ever persisting — otherwise a fast
// connect/disconnect cycle on a room that isn't cached yet (e.g. y-websocket's docs map was
// reset by a server restart since a .docx import last touched it, and the very first real
// connection afterward is a brief instructor read-only view) can call writeState while the
// in-memory ydoc is still empty, silently overwriting real persisted content with an empty
// encoded state. Never cleaned up per-room: entries are cheap settled promises and the number of
// distinct rooms is bounded by how many groups this server process ever serves, which is
// negligible at this project's scale.
const restoreReady = new Map<string, Promise<void>>();

export function groupIdFromRoom(room: string): number {
  const match = /^group-doc-(\d+)$/.exec(room);
  if (!match) throw new Error(`Invalid collab room name: ${room}`);
  return Number(match[1]);
}

async function persist(room: string, ydoc: YTypes.Doc): Promise<void> {
  const groupId = groupIdFromRoom(room);
  const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
  await prisma.document.upsert({
    where: { groupId },
    update: { yjsState: state },
    create: { groupId, yjsState: state },
  });
}

function scheduleDebouncedPersist(room: string, ydoc: YTypes.Doc): void {
  const existing = debounceTimers.get(room);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    room,
    setTimeout(() => {
      debounceTimers.delete(room);
      persist(room, ydoc).catch((err) => {
        console.error(`[collab] debounced persist failed for ${room}`, err);
      });
    }, DEBOUNCE_MS)
  );
}

export const yjsPersistence = {
  async bindState(room: string, ydoc: YTypes.Doc): Promise<void> {
    const groupId = groupIdFromRoom(room);

    // Both listeners are wired up before any `await` below — including the call into
    // attachAuthorshipTracking, which synchronously registers its own listener as the very
    // first thing it does (see its comment for the full story). A user can start typing the
    // instant the editor connects, well before the Document.findUnique() below resolves under
    // real latency; anything registered only after that point would miss those edits entirely,
    // since Yjs never replays past updates to a listener added later. This mirrors, one level
    // up, the exact same fix already applied inside attachAuthorshipTracking.
    ydoc.on("update", () => scheduleDebouncedPersist(room, ydoc));
    const authorshipTracking = attachAuthorshipTracking(room, groupId, ydoc);

    // Set synchronously, before the first await below, so a writeState() that fires the instant
    // this room is created (a fast connect/disconnect cycle) always finds this entry and waits
    // on it rather than persisting a not-yet-restored, still-empty ydoc. See restoreReady's
    // declaration above and its consumer in writeState below.
    const restorePromise = (async () => {
      const doc = await prisma.document.findUnique({ where: { groupId } });

      if (doc?.yjsState) {
        Y.applyUpdate(ydoc, doc.yjsState);
      } else if (doc?.content) {
        try {
          const json = JSON.parse(doc.content) as Record<string, unknown>;
          prosemirrorJSONToYXmlFragment(legacySchema, json, ydoc.getXmlFragment("default"));
        } catch (err) {
          console.error(`[collab] failed to migrate legacy content for ${room}`, err);
        }
      }
    })();
    restoreReady.set(
      room,
      restorePromise.catch((err) => {
        console.error(`[collab] restore failed for ${room}`, err);
      })
    );

    await Promise.all([authorshipTracking, restorePromise]);
  },

  async writeState(room: string, ydoc: YTypes.Doc): Promise<void> {
    const existing = debounceTimers.get(room);
    if (existing) {
      clearTimeout(existing);
      debounceTimers.delete(room);
    }
    // Never persist a room's state before its own restore (above) has had a chance to run —
    // otherwise a fast connect/disconnect cycle on a not-yet-restored room persists the
    // still-empty in-memory doc, silently overwriting real content already sitting in Postgres.
    const restore = restoreReady.get(room);
    if (restore) await restore;
    await persist(room, ydoc);
  },
};
