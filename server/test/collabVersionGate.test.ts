import { describe, it, expect, afterEach } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import WebSocket from "ws";
import request from "supertest";
import { createApp } from "../src/app.js";
import { attachYjsCollabServer } from "../src/collab/yjsServer.js";
import { COLLAB_SCHEMA_VERSION, COLLAB_VERSION_CLOSE_CODE } from "@shared/collabVersion.js";
import { authHeaderFor, createAssignment, createClassSection, createMembership, createProject, createUser } from "./factories.js";

// An old client (opened before `pageBreak` shipped) deletes content it does not understand and
// syncs the deletion to everyone (client/e2e/schemaMismatch.mjs). The collab server therefore refuses
// any client whose schema version differs - including one that sends none (a pre-pageBreak client).

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function startServer() {
  const server = http.createServer(createApp());
  attachYjsCollabServer(server);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return (server.address() as AddressInfo).port;
}

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: student } = await createUser({ systemRole: "STUDENT" });
  const cls = await createClassSection(instructor.id);
  const assignment = await createAssignment(cls.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: assignment.id });
  await createMembership(student.id, project.id, "LEADER");
  const token = authHeaderFor(student).replace("Bearer ", "");
  return { project, token };
}

function connect(port: number, groupId: number, token: string, version?: string) {
  const v = version === undefined ? "" : `&v=${version}`;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/collab/group-doc-${groupId}?token=${token}${v}`);
  const messages: Buffer[] = [];
  ws.on("message", (m) => messages.push(Buffer.from(m as Buffer)));
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() }))
  );
  const opened = new Promise<void>((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
  return { ws, messages, closed, opened };
}

describe("collab schema-version gate", () => {
  it("GET /api/version reports the current schema version, publicly", async () => {
    const res = await request(createApp()).get("/api/version");
    expect(res.status).toBe(200);
    expect(res.body.collabSchemaVersion).toBe(COLLAB_SCHEMA_VERSION);
    expect(typeof res.body.build).toBe("string");
  });

  it("refuses a client that sends no version (a pre-pageBreak client) with close code 4409", async () => {
    const port = await startServer();
    const { project, token } = await setup();
    const c = connect(port, project.id, token);
    await c.opened;
    const { code, reason } = await c.closed;
    expect(code).toBe(COLLAB_VERSION_CLOSE_CODE);
    expect(reason).toBe("version-mismatch");
    expect(c.messages).toHaveLength(0); // never joined the room: no sync step was sent
  }, 30000);

  it("refuses an older or malformed version", async () => {
    const port = await startServer();
    const { project, token } = await setup();
    for (const v of ["1", String(COLLAB_SCHEMA_VERSION - 1), "abc", "999"]) {
      const c = connect(port, project.id, token, v);
      await c.opened;
      expect((await c.closed).code, `v=${v}`).toBe(COLLAB_VERSION_CLOSE_CODE);
      expect(c.messages).toHaveLength(0);
    }
  }, 30000);

  it("lets a current client join and sync", async () => {
    const port = await startServer();
    const { project, token } = await setup();
    const c = connect(port, project.id, token, String(COLLAB_SCHEMA_VERSION));
    await c.opened;
    const deadline = Date.now() + 15000;
    while (c.messages.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    expect(c.messages.length).toBeGreaterThan(0); // y-websocket sends its sync step on join
    expect(c.ws.readyState).toBe(WebSocket.OPEN);
    c.ws.close();
    await c.closed;
  }, 30000);

  it("still rejects a bad token before looking at the version", async () => {
    const port = await startServer();
    const { project } = await setup();
    const c = connect(port, project.id, "not-a-token", String(COLLAB_SCHEMA_VERSION));
    await expect(c.opened).rejects.toBeDefined();
  }, 30000);
});
