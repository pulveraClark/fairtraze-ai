import { describe, it, expect } from "vitest";
import WebSocket from "ws";
import type * as YTypes from "yjs";
import { Y } from "../src/collab/yjsCjs.js";
import { prisma } from "../src/lib/prisma.js";
import { attachAuthorshipTracking } from "../src/collab/authorshipCapture.js";
import { computeAuthorshipMap } from "../src/collab/authorshipMap.js";
import { computeDocumentRawStats } from "../src/collab/editStats.js";
import { wsUserId } from "../src/collab/connectionRegistry.js";
import { plainTextRangeToPMRange } from "../../client/src/lib/authorshipHighlight.js";
import { createProject, createUser } from "./factories.js";

// Regression tests for the authorship-capture fix: extractPlainText used Y.XmlText.toString(),
// which wraps marked runs in XML tags ("Hello <bold>world</bold>"), so recorded offsets lived in a
// tag-inflated space the client's text-node walk (authorshipHighlight.ts) never sees, and a bare
// mark toggle produced phantom INSERT/DELETE events. It now joins toDelta() string inserts only.

const FLUSH_WAIT_MS = 2000; // FLUSH_DEBOUNCE_MS is 1500

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls until the debounced flush has written at least `count` events — a fixed sleep races
// slow (cold Neon) round trips. Throws on timeout so a missing flush fails loudly.
async function waitForEvents(documentId: number, count: number, timeoutMs = 25000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await prisma.editEvent.count({ where: { documentId } })) >= count) return;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${count} EditEvents on document ${documentId}`);
}

function fakeConn(userId: number): WebSocket {
  const conn = Object.create(WebSocket.prototype) as WebSocket;
  wsUserId.set(conn, userId);
  return conn;
}

async function setup() {
  // Sequential, not Promise.all: the factory's emailCounter is read before an await, so parallel
  // calls collide on the same email.
  const { user: alice } = await createUser({ systemRole: "STUDENT" });
  const { user: bob } = await createUser({ systemRole: "STUDENT" });
  const project = await createProject();
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("default");
  await attachAuthorshipTracking(`group-doc-${project.id}`, project.id, ydoc);
  const doc = await prisma.document.findUniqueOrThrow({ where: { groupId: project.id } });
  const connFor = new Map([
    [alice.id, fakeConn(alice.id)],
    [bob.id, fakeConn(bob.id)],
  ]);
  const as = (userId: number, fn: () => void) => ydoc.transact(fn, connFor.get(userId));
  return { alice, bob, project, ydoc, fragment, doc, as };
}

// The client's model, mirrored from the Yjs tree: PM text = concatenated text nodes (one per
// delta string op), no separator between blocks, leaf/embed nodes (image, hardBreak) contribute
// no text but do occupy a position. Returns the flattened text plus a fake PM doc exposing the
// same `descendants` surface plainTextRangeToPMRange walks, with PM-style positions.
function clientModel(fragment: YTypes.XmlFragment) {
  let pos = 0;
  let text = "";
  const chars: { pos: number; ch: string }[] = [];
  const textNodes: { text: string; pos: number }[] = [];

  const walk = (node: YTypes.XmlFragment | YTypes.XmlElement | YTypes.XmlText) => {
    if (node instanceof Y.XmlText) {
      for (const op of node.toDelta() as { insert?: unknown }[]) {
        if (typeof op.insert !== "string") continue;
        textNodes.push({ text: op.insert, pos });
        for (const ch of op.insert) chars.push({ pos: pos++, ch });
        text += op.insert;
      }
      return;
    }
    const children = node.toArray() as (YTypes.XmlElement | YTypes.XmlText)[];
    const isLeaf = node instanceof Y.XmlElement && children.length === 0;
    if (isLeaf) {
      pos += 1; // image / hardBreak: one position, zero text
      return;
    }
    if (node instanceof Y.XmlElement) pos += 1; // open token
    for (const c of children) walk(c);
    if (node instanceof Y.XmlElement) pos += 1; // close token
  };
  walk(fragment);

  const fakePMDoc = {
    descendants(cb: (n: { isText: boolean; text: string }, p: number) => boolean | void) {
      for (const t of textNodes) cb({ isText: true, text: t.text }, t.pos);
    },
  };
  return { text, chars, fakePMDoc };
}

// What the client would actually paint for a span: run the real plainTextRangeToPMRange and read
// the characters under the resulting PM range.
function paintedText(model: ReturnType<typeof clientModel>, start: number, end: number): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const range = plainTextRangeToPMRange(model.fakePMDoc as any, start, end);
  if (!range) return "";
  return model.chars
    .filter((c) => c.pos >= range.from && c.pos < range.to)
    .map((c) => c.ch)
    .join("");
}

describe("authorship capture — marks never leak into offsets", () => {
  it("Alice 'Hello ', Bob bold 'world', Alice ' end' → spans [0,6) [6,11) [11,15)", async () => {
    const { alice, bob, fragment, doc, as } = await setup();

    const p = new Y.XmlElement("paragraph");
    const t = new Y.XmlText();
    p.insert(0, [t]);
    as(alice.id, () => {
      fragment.insert(0, [p]);
      t.insert(0, "Hello ");
    });
    await sleep(10);
    as(bob.id, () => t.insert(6, "world", { bold: {} }));
    await sleep(10);
    as(alice.id, () => t.insert(11, " end"));
    await waitForEvents(doc.id, 3);

    const map = await computeAuthorshipMap(doc.id);
    expect(map.spans).toEqual([
      { userId: alice.id, start: 0, end: 6 },
      { userId: bob.id, start: 6, end: 11 },
      { userId: alice.id, start: 11, end: 15 },
    ]);

    const model = clientModel(fragment);
    expect(model.text).toBe("Hello world end");
    expect(model.text.length).toBe(15);
  }, 30000);

  it("toggling bold/italic/color/font size on existing text creates zero EditEvents", async () => {
    const { alice, bob, fragment, doc, as } = await setup();

    const p = new Y.XmlElement("paragraph");
    const t = new Y.XmlText();
    p.insert(0, [t]);
    as(alice.id, () => {
      fragment.insert(0, [p]);
      t.insert(0, "Hello world, plain text.");
    });
    await waitForEvents(doc.id, 1);
    const before = await prisma.editEvent.count({ where: { documentId: doc.id } });
    expect(before).toBe(1);

    as(bob.id, () => t.format(0, 5, { bold: {} }));
    as(bob.id, () => t.format(0, 5, { italic: {} }));
    as(bob.id, () => t.format(6, 5, { textStyle: { color: "#ff0000" } }));
    as(bob.id, () => t.format(6, 5, { textStyle: { fontSize: "24px" } }));
    as(bob.id, () => t.format(0, 5, { bold: null })); // un-toggle too
    await sleep(FLUSH_WAIT_MS);

    expect(await prisma.editEvent.count({ where: { documentId: doc.id } })).toBe(before);
    expect(await prisma.editEvent.count({ where: { documentId: doc.id, userId: bob.id } })).toBe(0);
    expect(await prisma.editSession.count({ where: { documentId: doc.id, userId: bob.id } })).toBe(0);

    // Ownership is untouched by formatting: all 24 characters still Alice's.
    const map = await computeAuthorshipMap(doc.id);
    expect(map.spans).toEqual([{ userId: alice.id, start: 0, end: 24 }]);
  }, 30000);

  it("mixed marks + bullet list + table + image: server offsets equal the client's plain text and spans land on the right characters", async () => {
    const { alice, bob, fragment, doc, as } = await setup();

    // heading (Alice) — plain
    const heading = new Y.XmlElement("heading");
    const headingText = new Y.XmlText();
    heading.insert(0, [headingText]);

    // bulletList > listItem > paragraph (Alice, bold run + plain run)
    const bulletList = new Y.XmlElement("bulletList");
    const listItem = new Y.XmlElement("listItem");
    const listPara = new Y.XmlElement("paragraph");
    const listText = new Y.XmlText();
    listPara.insert(0, [listText]);
    listItem.insert(0, [listPara]);
    bulletList.insert(0, [listItem]);

    // table > tableRow > tableCell > paragraph (Bob, italic + color + fontSize)
    const cellPara = new Y.XmlElement("paragraph");
    const cellText = new Y.XmlText();
    cellPara.insert(0, [cellText]);
    const tableCell = new Y.XmlElement("tableCell");
    tableCell.insert(0, [cellPara]);
    const tableRow = new Y.XmlElement("tableRow");
    tableRow.insert(0, [tableCell]);
    const table = new Y.XmlElement("table");
    table.insert(0, [tableRow]);

    // closing paragraph (Alice)
    const tail = new Y.XmlElement("paragraph");
    const tailText = new Y.XmlText();
    tail.insert(0, [tailText]);

    as(alice.id, () => {
      fragment.insert(0, [heading, bulletList, table, tail]);
      headingText.insert(0, "Title");
      listText.insert(0, "item ", {});
      listText.insert(5, "one", { bold: {} });
    });
    await sleep(10);
    as(bob.id, () => {
      cellText.insert(0, "cell", { italic: {}, textStyle: { color: "#00f", fontSize: "18px" } });
    });
    await sleep(10);
    // Bob also drops an image between blocks (attribute-only node: no text, one PM position).
    as(bob.id, () => {
      fragment.insert(3, [new Y.XmlElement("image")]);
    });
    await sleep(10);
    as(alice.id, () => {
      tailText.insert(0, "tail", { bold: {}, textStyle: { color: "#f00" } });
    });
    await waitForEvents(doc.id, 3);

    const model = clientModel(fragment);
    expect(model.text).toBe("Titleitem onecelltail");

    const map = await computeAuthorshipMap(doc.id);
    // Server-side total length equals the client's plain-text length (no tags, no separators).
    expect(map.spans[map.spans.length - 1]!.end).toBe(model.text.length);
    expect(map.spans).toEqual([
      { userId: alice.id, start: 0, end: 13 }, // "Title" + "item one"
      { userId: bob.id, start: 13, end: 17 }, // "cell"
      { userId: alice.id, start: 17, end: 21 }, // "tail"
    ]);

    // Reconstruct each author's text from the spans against the client's text — this is the
    // real correctness check (spans land on the characters each author actually typed).
    const byAuthor = new Map<number, string>();
    for (const s of map.spans) {
      byAuthor.set(s.userId, (byAuthor.get(s.userId) ?? "") + model.text.slice(s.start, s.end));
    }
    expect(byAuthor.get(alice.id)).toBe("Titleitem onetail");
    expect(byAuthor.get(bob.id)).toBe("cell");

    // And what the client's own mapper would paint for each span is exactly that text.
    for (const s of map.spans) {
      expect(paintedText(model, s.start, s.end).replace(/\s+$/, "")).toBe(
        model.text.slice(s.start, s.end).replace(/\s+$/, "")
      );
    }
  }, 30000);

  it("Docs raw stats for a formatted passage equal the plain-text character counts", async () => {
    const { alice, project, fragment, doc, as } = await setup();

    const p = new Y.XmlElement("paragraph");
    const t = new Y.XmlText();
    p.insert(0, [t]);
    as(alice.id, () => {
      fragment.insert(0, [p]);
      t.insert(0, "Plain ");
      t.insert(6, "bold", { bold: {} });
      t.insert(10, " and ");
      t.insert(15, "styled", { italic: {}, textStyle: { color: "#123456", fontSize: "20px" } });
    });
    await waitForEvents(doc.id, 1);

    const plain = "Plain bold and styled";
    const roster = [{ userId: alice.id, studentName: alice.name, githubUsername: "" }];
    const [stats] = await computeDocumentRawStats(doc.id, roster);
    expect(stats!.retainedChars).toBe(plain.length);
    expect(stats!.totalInsertedChars).toBe(plain.length);
    expect(stats!.totalDeletedChars).toBe(0);
    void project;
  }, 30000);
});
