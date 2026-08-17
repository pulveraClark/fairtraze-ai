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
const legacySchema = new Schema({
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

    ydoc.on("update", () => scheduleDebouncedPersist(room, ydoc));

    await attachAuthorshipTracking(room, groupId, ydoc);
  },

  async writeState(room: string, ydoc: YTypes.Doc): Promise<void> {
    const existing = debounceTimers.get(room);
    if (existing) {
      clearTimeout(existing);
      debounceTimers.delete(room);
    }
    await persist(room, ydoc);
  },
};
