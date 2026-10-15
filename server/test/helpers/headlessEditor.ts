import WebSocket from "ws";
import { JSDOM } from "jsdom";
import * as YClient from "yjs";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import type * as YTypes from "yjs";
import { Y } from "../../src/collab/yjsCjs.js";
import { wsUserId } from "../../src/collab/connectionRegistry.js";
import { starterKitOptions, formattingExtensions } from "../../../client/src/lib/formattingExtensions.js";
import { SearchReplace } from "../../../client/src/lib/searchReplace.js";

// A real TipTap editor (the same extensions the browser uses for formatting tools) running headless
// in jsdom, wired to the SERVER's Y.Doc exactly like a browser + y-websocket is: the editor lives on
// its own client-side Y.Doc and every local change leaves it as a binary Yjs update, applied to the
// server doc with the user's connection as origin (what y-websocket's server does for each message).
// Updates are forwarded one by one - y-websocket's client does not merge updates.
//
// Two Yjs module instances are involved on purpose (the server's CJS one via yjsCjs.ts, and the ESM
// one TipTap loads); binary updates are instance-independent, so this mirrors production.

let domInstalled = false;
function installDom() {
  if (domInstalled) return;
  domInstalled = true;
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const w = dom.window as unknown as Record<string, unknown> & Window;
  // ProseMirror asks for layout rects that jsdom does not implement.
  const rect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });
  const proto = w as unknown as { Range: { prototype: Record<string, unknown> }; Element: { prototype: Record<string, unknown> } };
  proto.Range.prototype.getClientRects = () => [];
  proto.Range.prototype.getBoundingClientRect = rect;
  proto.Element.prototype.getClientRects = () => [];
  const names = [
    "window", "document", "Node", "Element", "HTMLElement", "DocumentFragment", "MutationObserver", "DOMParser",
    "Range", "Text", "Selection", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "Event", "KeyboardEvent",
  ];
  for (const name of names) {
    const value = name === "window" ? w : w[name];
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  Object.defineProperty(globalThis, "navigator", { value: w.navigator, configurable: true, writable: true });
}

export function fakeConn(userId: number): WebSocket {
  const conn = Object.create(WebSocket.prototype) as WebSocket;
  wsUserId.set(conn, userId);
  return conn;
}

const REMOTE = Symbol("remote-from-server");

export interface HeadlessClient {
  editor: Editor;
  clientDoc: YClient.Doc;
  conn: WebSocket;
  /** Number of Yjs updates this client has sent to the server so far. */
  sentUpdates: () => number;
  destroy: () => void;
}

export function connectClient(serverDoc: YTypes.Doc, userId: number): HeadlessClient {
  installDom();
  const clientDoc = new YClient.Doc();
  const conn = fakeConn(userId);
  let sent = 0;

  YClient.applyUpdate(clientDoc, Y.encodeStateAsUpdate(serverDoc), REMOTE);
  clientDoc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE) return;
    sent++;
    Y.applyUpdate(serverDoc, update, conn);
  });
  const fanOut = (update: Uint8Array, origin: unknown) => {
    if (origin === conn) return;
    YClient.applyUpdate(clientDoc, update, REMOTE);
  };
  serverDoc.on("update", fanOut);

  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [
      StarterKit.configure(starterKitOptions),
      ...formattingExtensions,
      SearchReplace,
      Collaboration.configure({ document: clientDoc }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
  });

  return {
    editor,
    clientDoc,
    conn,
    sentUpdates: () => sent,
    destroy: () => {
      serverDoc.off("update", fanOut);
      editor.destroy();
      clientDoc.destroy();
    },
  };
}
