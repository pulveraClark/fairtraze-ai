import { describe, it, expect, afterEach } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import WebSocket from "ws";
import { WebsocketProvider } from "y-websocket";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { Y } from "../src/collab/yjsCjs.js";
import { attachYjsCollabServer, COLLAB_ROOM_UNAVAILABLE_CLOSE_CODE } from "../src/collab/yjsServer.js";
import { COLLAB_SCHEMA_VERSION } from "@shared/collabVersion.js";
import { authHeaderFor, createAssignment, createClassSection, createMembership, createProject, createUser } from "./factories.js";

// Staging group 86: a client holding the whole document (a tab left open across a restart)
// reconnected to a room whose restore was still in flight. The server's sync-step-1 carried the empty
// state vector, so the client answered with the entire document; authorshipCapture diffed that against
// an empty baseline and credited all of it to that user as one INSERT. The fix: the socket is accepted
// but not joined to the room until persistence.ts's bindState has finished (yjsServer.ts), its
// early messages buffered and replayed, and a room that failed to restore (or takes > the timeout) is
// refused instead of served empty.

const SEED_TEXT = "Persisted document text that a stale tab also holds.";
const servers: http.Server[] = [];
const providers: WebsocketProvider[] = [];
const originalFindUnique = prisma.document.findUnique.bind(prisma.document);

afterEach(async () => {
  prisma.document.findUnique = originalFindUnique;
  delete process.env.COLLAB_ROOM_READY_TIMEOUT_MS;
  for (const p of providers.splice(0)) {
    p.destroy();
    p.doc.destroy();
  }
  await new Promise((r) => setTimeout(r, 200)); // let closeConn/writeState settle
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function startServer() {
  const server = http.createServer(createApp());
  attachYjsCollabServer(server);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return (server.address() as AddressInfo).port;
}

function delayFindUnique(ms: number, fail = false) {
  prisma.document.findUnique = (async (...args: Parameters<typeof prisma.document.findUnique>) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    if (fail) throw new Error("simulated database failure");
    return originalFindUnique(...args);
  }) as typeof prisma.document.findUnique;
}

function seedUpdate(text: string): Uint8Array {
  const ydoc = new Y.Doc();
  const para = new Y.XmlElement("paragraph");
  const t = new Y.XmlText();
  t.insert(0, text);
  para.insert(0, [t]);
  ydoc.getXmlFragment("default").insert(0, [para]);
  return Y.encodeStateAsUpdate(ydoc);
}

async function setup(seed: boolean) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: student } = await createUser({ systemRole: "STUDENT" });
  const cls = await createClassSection(instructor.id);
  const assignment = await createAssignment(cls.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: assignment.id });
  await createMembership(student.id, project.id, "LEADER");
  const update = seedUpdate(SEED_TEXT);
  if (seed) {
    await prisma.document.upsert({
      where: { groupId: project.id },
      update: { yjsState: Buffer.from(update) },
      create: { groupId: project.id, yjsState: Buffer.from(update) },
    });
  }
  const token = authHeaderFor(student).replace("Bearer ", "");
  return { project, student, token, update };
}

function connectProvider(port: number, groupId: number, token: string, ydoc: InstanceType<typeof Y.Doc>) {
  const provider = new WebsocketProvider(`ws://127.0.0.1:${port}/collab`, `group-doc-${groupId}`, ydoc as never, {
    WebSocketPolyfill: WebSocket as never,
    params: { token, v: String(COLLAB_SCHEMA_VERSION) },
    disableBc: true,
  });
  providers.push(provider);
  return provider;
}

async function waitFor(cond: () => boolean, ms = 20000) {
  const deadline = Date.now() + ms;
  while (!cond() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  return cond();
}

describe("collab: a room is joined only after its state is restored", () => {
  it("does not credit a reconnecting full-document client with the whole document", async () => {
    const port = await startServer();
    const { project, token, update } = await setup(true);

    // The stale tab: holds exactly the persisted document (same Yjs items), server room is cold and
    // its restore is slow.
    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, update);
    delayFindUnique(1200);
    const provider = connectProvider(port, project.id, token, clientDoc);

    expect(await waitFor(() => provider.synced)).toBe(true);
    await new Promise((r) => setTimeout(r, 2500)); // > the 1.5s authorship flush debounce

    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(await prisma.editEvent.count({ where: { documentId: doc!.id } })).toBe(0);
    expect(await prisma.editSession.count({ where: { documentId: doc!.id } })).toBe(0);
    expect(clientDoc.getXmlFragment("default").toString()).toContain(SEED_TEXT);
  }, 60000);

  it("buffers the client's own sync-step-1 while waiting, so an empty client still receives the document", async () => {
    const port = await startServer();
    const { project, token } = await setup(true);

    const clientDoc = new Y.Doc(); // fresh page load
    delayFindUnique(1200);
    const provider = connectProvider(port, project.id, token, clientDoc);

    // synced flips only when the server answers THIS client's sync-step-1; if that message were lost
    // while the room was restoring, the client would never sync or receive the text.
    expect(await waitFor(() => provider.synced)).toBe(true);
    expect(clientDoc.getXmlFragment("default").toString()).toContain(SEED_TEXT);
  }, 60000);

  it("still credits genuinely new edits from a reconnecting client to that user", async () => {
    const port = await startServer();
    const { project, student, token, update } = await setup(true);

    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, update);
    const extra = " Offline addition.";
    const text = (clientDoc.getXmlFragment("default").get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlText>;
    text.insert(text.length, extra); // an edit the server has never seen

    delayFindUnique(800);
    const provider = connectProvider(port, project.id, token, clientDoc);
    expect(await waitFor(() => provider.synced)).toBe(true);
    await new Promise((r) => setTimeout(r, 2500));

    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    const events = await prisma.editEvent.findMany({ where: { documentId: doc!.id } });
    expect(events).toHaveLength(1);
    expect(events[0]!.userId).toBe(student.id);
    expect(events[0]!.eventType).toBe("INSERT");
    expect(events[0]!.length).toBe(extra.length); // the real delta, not the whole document
  }, 60000);

  it("closes the connection and never persists an empty doc when the restore fails", async () => {
    const port = await startServer();
    const { project, token } = await setup(true);
    const before = await prisma.document.findUnique({ where: { groupId: project.id } });

    delayFindUnique(100, true);
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/collab/group-doc-${project.id}?token=${token}&v=${COLLAB_SCHEMA_VERSION}`
    );
    const closed = await new Promise<{ code: number; reason: string }>((resolve) =>
      ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() }))
    );
    expect(closed.code).toBe(COLLAB_ROOM_UNAVAILABLE_CLOSE_CODE);

    await new Promise((r) => setTimeout(r, 3500)); // past the 3s persist debounce
    prisma.document.findUnique = originalFindUnique;
    const after = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(Buffer.compare(after!.yjsState!, before!.yjsState!)).toBe(0); // untouched

    // The failed room was dropped: the next connection restores afresh and syncs.
    const clientDoc = new Y.Doc();
    const provider = connectProvider(port, project.id, token, clientDoc);
    expect(await waitFor(() => provider.synced)).toBe(true);
    expect(clientDoc.getXmlFragment("default").toString()).toContain(SEED_TEXT);
  }, 60000);

  it("closes the connection when the restore takes longer than the timeout", async () => {
    process.env.COLLAB_ROOM_READY_TIMEOUT_MS = "300";
    const port = await startServer();
    const { project, token } = await setup(true);

    delayFindUnique(1500);
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/collab/group-doc-${project.id}?token=${token}&v=${COLLAB_SCHEMA_VERSION}`
    );
    const messages: Buffer[] = [];
    ws.on("message", (m) => messages.push(Buffer.from(m as Buffer)));
    const closed = await new Promise<{ code: number }>((resolve) => ws.on("close", (code) => resolve({ code })));
    expect(closed.code).toBe(COLLAB_ROOM_UNAVAILABLE_CLOSE_CODE);
    expect(messages).toHaveLength(0); // never joined: no sync step was sent
  }, 60000);
});
