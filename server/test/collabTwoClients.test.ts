import { describe, it, expect, afterEach } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import WebSocket from "ws";
import { WebsocketProvider } from "y-websocket";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
// The browser side: the ESM build y-websocket's WebsocketProvider uses. (Client docs built from the server's
// CJS copy in collab/yjsCjs.ts left one member's updates invisible to the other in this process: two Yjs copies.)
import * as Y from "yjs";
import { attachYjsCollabServer } from "../src/collab/yjsServer.js";
import { COLLAB_SCHEMA_VERSION } from "@shared/collabVersion.js";
import { computeDocumentTeamReport } from "@shared/documentScoring.js";
import { computeDocumentRawStats } from "../src/collab/editStats.js";
import { authHeaderFor, createAssignment, createClassSection, createMembership, createProject, createUser } from "./factories.js";

// Two group members open the same document room over real WebSockets (same server path the browser
// uses: /collab, y-websocket). Each types; the other must receive it, and the capture credits each
// span to the person who typed it.

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

/** The same shape TipTap writes: fragment > paragraph > text. */
function typeParagraph(doc: InstanceType<typeof Y.Doc>, text: string) {
  const frag = doc.getXmlFragment("default");
  const para = new Y.XmlElement("paragraph");
  const t = new Y.XmlText();
  para.insert(0, [t]);
  frag.insert(frag.length, [para]);
  t.insert(0, text);
}

describe("collab: two people in the same document", () => {
  // DOC-02
  it("each member's typing reaches the other, and each span is credited to who typed it", async () => {
    const port = await startServer();
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: ana } = await createUser({ systemRole: "STUDENT", name: "Ana" });
    const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Ben" });
    const cls = await createClassSection(instructor.id);
    const assignment = await createAssignment(cls.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(ana.id, project.id, "LEADER");
    await createMembership(ben.id, project.id);

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const pA = connect(port, project.id, authHeaderFor(ana).replace("Bearer ", ""), docA);
    expect(await waitFor(() => pA.synced), "first member synced").toBe(true);
    const pB = connect(port, project.id, authHeaderFor(ben).replace("Bearer ", ""), docB);
    expect(await waitFor(() => pB.synced), "second member synced").toBe(true);

    const fromAna = "Ana writes the introduction here.";
    typeParagraph(docA, fromAna);
    expect(await waitFor(() => docB.getXmlFragment("default").toString().includes(fromAna))).toBe(true);

    const fromBen = "Ben adds the conclusion.";
    typeParagraph(docB, fromBen);
    expect(await waitFor(() => docA.getXmlFragment("default").toString().includes(fromBen))).toBe(true);

    // Both screens now hold both texts.
    for (const d of [docA, docB]) {
      const xml = d.getXmlFragment("default").toString();
      expect(xml).toContain(fromAna);
      expect(xml).toContain(fromBen);
    }

    // Capture: one INSERT per person, credited to the account that typed it (flush debounce is 1.5 s).
    await new Promise((r) => setTimeout(r, 2800));
    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    const events = await prisma.editEvent.findMany({ where: { documentId: doc!.id, eventType: "INSERT" } });
    const chars = (userId: number) => events.filter((e) => e.userId === userId).reduce((n, e) => n + e.length, 0);
    expect(chars(ana.id)).toBe(fromAna.length);
    expect(chars(ben.id)).toBe(fromBen.length);

    // Scored share: the same two steps the analysis runs for an EDITOR group.
    const roster = [ana, ben].map((u) => ({ userId: u.id, studentName: u.name, githubUsername: "" }));
    const report = computeDocumentTeamReport(await computeDocumentRawStats(doc!.id, roster));
    const shares = report.members.map((m) => m.contributionShare);
    expect(shares.every((s) => s > 0), "both members have a share above 0").toBe(true);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
  }, 90000);
});
