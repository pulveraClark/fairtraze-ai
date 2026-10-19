import { describe, it, expect, afterEach } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import WebSocket from "ws";
import { WebsocketProvider } from "y-websocket";
import { docs } from "y-websocket/bin/utils";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { Y } from "../src/collab/yjsCjs.js";
import { attachYjsCollabServer } from "../src/collab/yjsServer.js";
import { attachAuthorshipTracking } from "../src/collab/authorshipCapture.js";
import { readOnlyWs, wsUserId } from "../src/collab/connectionRegistry.js";
import { isDocumentWriteMessage } from "../src/collab/readOnlyGate.js";
import { COLLAB_SCHEMA_VERSION } from "@shared/collabVersion.js";
import { authHeaderFor, createAssignment, createClassSection, createMembership, createProject, createUser } from "./factories.js";

// The instructor's editor is read-only only in the browser; the collab server used to accept any
// update from any authorized socket and credit it to that user. Now only group members can write.

const SEED_TEXT = "Persisted document text.";
const servers: http.Server[] = [];
const providers: WebsocketProvider[] = [];

afterEach(async () => {
  for (const p of providers.splice(0)) {
    p.destroy();
    p.doc.destroy();
  }
  await new Promise((r) => setTimeout(r, 200));
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function startServer() {
  const server = http.createServer(createApp());
  attachYjsCollabServer(server);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return (server.address() as AddressInfo).port;
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

function connect(port: number, groupId: number, token: string, ydoc: InstanceType<typeof Y.Doc>) {
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

const paragraphText = (doc: InstanceType<typeof Y.Doc>) =>
  (doc.getXmlFragment("default").get(0) as InstanceType<typeof Y.XmlElement>).get(0) as InstanceType<typeof Y.XmlText>;

describe("isDocumentWriteMessage", () => {
  it("blocks sync step 2 and update, passes step 1, awareness and junk", () => {
    expect(isDocumentWriteMessage(Uint8Array.from([0, 0, 1, 0]))).toBe(false); // sync step 1
    expect(isDocumentWriteMessage(Uint8Array.from([0, 1, 2, 0, 0]))).toBe(true); // sync step 2
    expect(isDocumentWriteMessage(Uint8Array.from([0, 2, 2, 0, 0]))).toBe(true); // sync update
    expect(isDocumentWriteMessage(Uint8Array.from([1, 1, 2, 3]))).toBe(false); // awareness
    expect(isDocumentWriteMessage(Uint8Array.from([3]))).toBe(false); // query awareness
    expect(isDocumentWriteMessage(Uint8Array.from([0]))).toBe(false); // truncated
    expect(isDocumentWriteMessage(new Uint8Array(0))).toBe(false);
  });
});

describe("collab: only group members can write", () => {
  it("drops an instructor's document changes, still delivers a member's edits to them, and credits only the member", async () => {
    const port = await startServer();
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: student } = await createUser({ systemRole: "STUDENT" });
    const cls = await createClassSection(instructor.id);
    const assignment = await createAssignment(cls.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(student.id, project.id, "LEADER");
    const update = seedUpdate(SEED_TEXT);
    await prisma.document.upsert({
      where: { groupId: project.id },
      update: { yjsState: Buffer.from(update) },
      create: { groupId: project.id, yjsState: Buffer.from(update) },
    });

    const instructorDoc = new Y.Doc();
    const studentDoc = new Y.Doc();
    const instructorProvider = connect(port, project.id, authHeaderFor(instructor).replace("Bearer ", ""), instructorDoc);
    const studentProvider = connect(port, project.id, authHeaderFor(student).replace("Bearer ", ""), studentDoc);
    expect(await waitFor(() => instructorProvider.synced && studentProvider.synced)).toBe(true);
    expect(instructorDoc.getXmlFragment("default").toString()).toContain(SEED_TEXT); // reading works

    // The instructor's browser writes (what the y-tiptap sync plugin can do even when read-only).
    const hack = " INSTRUCTOR-WRITE";
    paragraphText(instructorDoc).insert(paragraphText(instructorDoc).length, hack);
    await new Promise((r) => setTimeout(r, 500));

    // A member edits; the instructor must still receive it.
    const real = " Member edit.";
    paragraphText(studentDoc).insert(paragraphText(studentDoc).length, real);
    expect(await waitFor(() => instructorDoc.getXmlFragment("default").toString().includes(real))).toBe(true);
    await new Promise((r) => setTimeout(r, 2500)); // > the 1.5s authorship flush debounce

    const room = docs.get(`group-doc-${project.id}`)!;
    const serverText = room.getXmlFragment("default").toString();
    expect(serverText).toContain(real);
    expect(serverText).not.toContain(hack);
    expect(studentDoc.getXmlFragment("default").toString()).not.toContain(hack);

    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    const events = await prisma.editEvent.findMany({ where: { documentId: doc!.id } });
    expect(events).toHaveLength(1);
    expect(events[0]!.userId).toBe(student.id);
    expect(events[0]!.length).toBe(real.length);
    expect(await prisma.editSession.count({ where: { documentId: doc!.id, userId: instructor.id } })).toBe(0);
  }, 90000);
});

describe("authorshipCapture ignores read-only connections", () => {
  it("records nothing for an update whose origin is a read-only ws, but still records a member's", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: student } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();
    const room = `group-doc-${project.id}`;

    const ydoc = new Y.Doc();
    await attachAuthorshipTracking(room, project.id, ydoc);

    const instructorWs = Object.create(WebSocket.prototype) as WebSocket;
    wsUserId.set(instructorWs, instructor.id);
    readOnlyWs.add(instructorWs);
    const studentWs = Object.create(WebSocket.prototype) as WebSocket;
    wsUserId.set(studentWs, student.id);

    const type = (text: string, origin: unknown) =>
      ydoc.transact(() => {
        const para = new Y.XmlElement("paragraph");
        const t = new Y.XmlText();
        t.insert(0, text);
        para.insert(0, [t]);
        ydoc.getXmlFragment("default").insert(ydoc.getXmlFragment("default").length, [para]);
      }, origin);

    type("instructor text", instructorWs);
    type("student text", studentWs);
    await new Promise((r) => setTimeout(r, 2500));

    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    const events = await prisma.editEvent.findMany({ where: { documentId: doc!.id } });
    expect(events.map((e) => e.userId)).toEqual([student.id]);
    expect(events[0]!.length).toBe("student text".length);
  }, 60000);
});
