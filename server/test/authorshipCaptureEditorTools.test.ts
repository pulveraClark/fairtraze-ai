import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { attachAuthorshipTracking } from "../src/collab/authorshipCapture.js";
import { computeAuthorshipMap } from "../src/collab/authorshipMap.js";
import { replaceMatches, getSearchState } from "../../client/src/lib/searchReplace.js";
import { connectClient, type HeadlessClient } from "./helpers/headlessEditor.js";
import { createProject, createUser } from "./factories.js";

// Editor tools (strike, justify, indent, checklist, horizontal line, clear formatting, links) are
// marks, node attributes and leaf nodes: they carry no text, so authorship capture must record
// ZERO characters for them. These tests drive a REAL TipTap editor (same extensions as the browser)
// into the REAL capture pipeline over binary Yjs updates - see helpers/headlessEditor.ts.
//
// Find/replace is an ordinary edit: the replaced text is credited to whoever replaced it, and
// "Replace all" must not re-credit unchanged text between matches.

const FLUSH_WAIT_MS = 2000; // FLUSH_DEBOUNCE_MS is 1500
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForEvents(documentId: number, count: number, timeoutMs = 25000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await prisma.editEvent.count({ where: { documentId } })) >= count) return;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${count} EditEvents on document ${documentId}`);
}

const clients: HeadlessClient[] = [];
afterEach(() => {
  while (clients.length) clients.pop()!.destroy();
});

async function setup() {
  const { user: alice } = await createUser({ systemRole: "STUDENT" });
  const { user: bob } = await createUser({ systemRole: "STUDENT" });
  const project = await createProject();
  const ydoc = new Y.Doc();
  await attachAuthorshipTracking(`group-doc-${project.id}`, project.id, ydoc);
  const doc = await prisma.document.findUniqueOrThrow({ where: { groupId: project.id } });
  const aliceClient = connectClient(ydoc, alice.id);
  const bobClient = connectClient(ydoc, bob.id);
  clients.push(aliceClient, bobClient);
  return { alice, bob, project, ydoc, doc, aliceClient, bobClient };
}

function plainText(ydoc: InstanceType<typeof Y.Doc>): string {
  let out = "";
  const walk = (node: unknown) => {
    if (node instanceof Y.XmlText) {
      for (const op of node.toDelta() as { insert?: unknown }[]) if (typeof op.insert === "string") out += op.insert;
    } else {
      (node as { toArray(): unknown[] }).toArray().forEach(walk);
    }
  };
  walk(ydoc.getXmlFragment("default"));
  return out;
}

const P1 = "The quick brown fox jumps over the lazy dog.";
const P2 = "Second paragraph with some more words in it.";

describe("editor tools add 0 characters and 0 credit", () => {
  it("strike, justify, indent/outdent, checklist toggle, horizontal line, clear formatting, link add/remove", async () => {
    const { alice, bob, ydoc, doc, aliceClient, bobClient } = await setup();

    aliceClient.editor.commands.insertContent(`<p>${P1}</p><p>${P2}</p>`);
    await waitForEvents(doc.id, 1);
    const expectedText = P1 + P2;
    expect(plainText(ydoc)).toBe(expectedText);
    const eventsBefore = await prisma.editEvent.count({ where: { documentId: doc.id } });
    const mapBefore = await computeAuthorshipMap(doc.id);
    expect(mapBefore.spans).toEqual([{ userId: alice.id, start: 0, end: expectedText.length }]);

    const ed = bobClient.editor;
    const sentBefore = bobClient.sentUpdates();

    // strikethrough on / off
    ed.commands.selectAll();
    ed.commands.toggleStrike();
    expect(ed.isActive("strike")).toBe(true);
    ed.commands.toggleStrike();
    expect(ed.isActive("strike")).toBe(false);

    // justify, then back
    ed.commands.setTextAlign("justify");
    expect(ed.isActive({ textAlign: "justify" })).toBe(true);
    ed.commands.setTextAlign("left");

    // indent / outdent on both paragraphs
    ed.commands.selectAll();
    ed.commands.indent();
    ed.commands.indent();
    expect(ed.getJSON().content?.[0]?.attrs?.indent).toBe(2);
    ed.commands.outdent();
    expect(ed.getJSON().content?.[0]?.attrs?.indent).toBe(1);
    ed.commands.clearIndent();

    // checklist: convert the first paragraph, tick it, untick, convert back
    ed.commands.setTextSelection(3);
    ed.commands.toggleTaskList();
    expect(ed.isActive("taskList")).toBe(true);
    ed.commands.updateAttributes("taskItem", { checked: true });
    expect(ed.isActive("taskItem", { checked: true })).toBe(true);
    ed.commands.updateAttributes("taskItem", { checked: false });
    ed.commands.toggleTaskList();
    expect(ed.isActive("taskList")).toBe(false);

    // horizontal line
    ed.commands.setTextSelection(3);
    ed.commands.setHorizontalRule();
    expect(JSON.stringify(ed.getJSON())).toContain("horizontalRule");

    // clear formatting after adding bold + colour + alignment + indent
    ed.commands.selectAll();
    ed.commands.toggleBold();
    ed.commands.setColor("#dc2626");
    ed.commands.setTextAlign("center");
    ed.commands.indent();
    ed.chain().unsetAllMarks().unsetTextAlign().clearIndent().run();
    expect(ed.isActive("bold")).toBe(false);

    // link add / remove (a mark on existing text)
    ed.commands.setTextSelection({ from: 5, to: 10 });
    ed.commands.setLink({ href: "https://example.com" });
    expect(ed.isActive("link")).toBe(true);
    ed.commands.extendMarkRange("link");
    ed.commands.unsetLink();
    expect(ed.isActive("link")).toBe(false);

    expect(bobClient.sentUpdates()).toBeGreaterThan(sentBefore); // the operations really ran
    await sleep(FLUSH_WAIT_MS);

    // Not one character of text changed, and Bob earned nothing.
    expect(plainText(ydoc)).toBe(expectedText);
    expect(await prisma.editEvent.count({ where: { documentId: doc.id } })).toBe(eventsBefore);
    expect(await prisma.editEvent.count({ where: { documentId: doc.id, userId: bob.id } })).toBe(0);
    expect(await prisma.editSession.count({ where: { documentId: doc.id, userId: bob.id } })).toBe(0);
    const mapAfter = await computeAuthorshipMap(doc.id);
    expect(mapAfter.spans).toEqual([{ userId: alice.id, start: 0, end: expectedText.length }]);
  }, 60000);
});

describe("find and replace credit", () => {
  const A = "The cat sat on the mat while the sun rose over the quiet hills and the cat purred.";
  const B = "Nothing in this long middle paragraph matches the search word, so it is plain filler text that stays Alice's.";
  const C = "Late in the day a cat napped.";
  const all = A + B + C;

  async function seeded() {
    const ctx = await setup();
    ctx.aliceClient.editor.commands.insertContent(`<p>${A}</p><p>${B}</p><p>${C}</p>`);
    await waitForEvents(ctx.doc.id, 1);
    expect(plainText(ctx.ydoc)).toBe(all);
    return ctx;
  }

  it("credits only the replaced words to the replacer, not the unchanged text between matches", async () => {
    const { alice, bob, ydoc, doc, bobClient } = await seeded();
    const ed = bobClient.editor;
    ed.commands.setSearch("cat", false);
    expect(getSearchState(ed.state).matches).toHaveLength(3);

    const sentBefore = bobClient.sentUpdates();
    const res = replaceMatches(ed, "dog"); // synchronous: the tightest timing, all inside one flush window
    expect(res).toEqual({ replaced: 3, skipped: 0 });
    // One Yjs update per match - nothing was merged on the way to the server.
    expect(bobClient.sentUpdates() - sentBefore).toBe(3);

    const expected = all.replaceAll("cat", "dog");
    await waitForEvents(doc.id, 1 + 6);
    await sleep(FLUSH_WAIT_MS);
    expect(plainText(ydoc)).toBe(expected);

    const bobEvents = await prisma.editEvent.findMany({ where: { documentId: doc.id, userId: bob.id }, orderBy: { id: "asc" } });
    expect(bobEvents).toHaveLength(6); // delete + insert per match
    for (const e of bobEvents) expect(e.length).toBe(3);
    expect(bobEvents.filter((e) => e.eventType === "INSERT").map((e) => e.insertedText)).toEqual(["dog", "dog", "dog"]);

    // Authorship: Bob owns exactly the three replaced words; everything else is still Alice's.
    const map = await computeAuthorshipMap(doc.id);
    const owned = (userId: number) => map.spans.filter((s) => s.userId === userId).reduce((n, s) => n + (s.end - s.start), 0);
    expect(owned(bob.id)).toBe(9);
    expect(owned(alice.id)).toBe(expected.length - 9);
    for (const s of map.spans.filter((s) => s.userId === bob.id)) expect(expected.slice(s.start, s.end)).toBe("dog");
  }, 90000);

  it("skips matches whose replacement is identical, so Replace all cannot re-credit unchanged text", async () => {
    const { bob, ydoc, doc, bobClient } = await seeded();
    const ed = bobClient.editor;
    ed.commands.setSearch("cat", false);

    const sentBefore = bobClient.sentUpdates();
    const res = replaceMatches(ed, "cat");
    expect(res).toEqual({ replaced: 0, skipped: 3 });
    expect(bobClient.sentUpdates()).toBe(sentBefore);

    // Case-insensitive search: only the match that actually differs from the replacement changes.
    ed.commands.insertContentAt(ed.state.doc.content.size, "<p>CAT</p>");
    await sleep(50);
    ed.commands.setSearch("cat", false);
    const mixed = replaceMatches(ed, "cat");
    expect(mixed).toEqual({ replaced: 1, skipped: 3 });

    await sleep(FLUSH_WAIT_MS);
    const bobInserts = await prisma.editEvent.findMany({ where: { documentId: doc.id, userId: bob.id, eventType: "INSERT" } });
    // Bob typed "CAT" (3) then replaced it with "cat" (3): never any of Alice's text.
    expect(bobInserts.reduce((n, e) => n + e.length, 0)).toBe(6);
    expect(plainText(ydoc)).toBe(all + "cat");
  }, 90000);

  it("documents the limit: one edit touching two distant spots is recorded as one wide span", async () => {
    const { bob, doc, bobClient } = await seeded();
    const ed = bobClient.editor;
    ed.commands.setSearch("cat", false);
    const { matches } = getSearchState(ed.state);
    // The same three replacements, but in a SINGLE transaction (what Replace all must never do).
    const tr = ed.state.tr;
    for (const m of [...matches].reverse()) tr.insertText("dog", m.from, m.to);
    ed.view.dispatch(tr);

    await waitForEvents(doc.id, 1 + 2);
    await sleep(FLUSH_WAIT_MS);
    const bobInserts = await prisma.editEvent.findMany({ where: { documentId: doc.id, userId: bob.id, eventType: "INSERT" } });
    expect(bobInserts).toHaveLength(1);
    // Capture trims ONE common prefix/suffix per update, so the unchanged text between the first
    // and last match is swept into Bob's insert. This is the credit shift replaceMatches avoids.
    expect(bobInserts[0]!.length).toBeGreaterThan(9);
    expect(bobInserts[0]!.length).toBe(all.lastIndexOf("cat") + 3 - all.indexOf("cat"));
  }, 90000);
});
