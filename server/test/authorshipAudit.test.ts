import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { findPhantomCandidates, plainTextLengthOf, summarizeEvents } from "../src/collab/authorshipAudit.js";
import { createMembership, createProject, createUser } from "./factories.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(dir, "..");
const tsxCli = path.resolve(serverDir, "../node_modules/tsx/dist/cli.mjs");

const TEXT = "x".repeat(120);

function stateWith(text: string): Uint8Array {
  const ydoc = new Y.Doc();
  const para = new Y.XmlElement("paragraph");
  const t = new Y.XmlText();
  t.insert(0, text);
  para.insert(0, [t]);
  ydoc.getXmlFragment("default").insert(0, [para]);
  return Y.encodeStateAsUpdate(ydoc);
}

async function seed() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: student } = await createUser({ systemRole: "STUDENT" });
  const project = await createProject();
  await createMembership(student.id, project.id, "LEADER");
  const doc = await prisma.document.create({ data: { groupId: project.id, yjsState: Buffer.from(stateWith(TEXT)) } });
  const t0 = new Date("2026-10-10T10:00:00Z");
  const t1 = new Date("2026-10-19T01:46:18Z");
  const real = await prisma.editEvent.create({
    data: { documentId: doc.id, userId: student.id, eventType: "INSERT", position: 0, length: 120, timestamp: t0, source: "LIVE", editType: "SUBSTANTIVE", insertedText: TEXT },
  });
  const phantom = await prisma.editEvent.create({
    data: { documentId: doc.id, userId: instructor.id, eventType: "INSERT", position: 0, length: 120, timestamp: t1, source: "LIVE", editType: "SUBSTANTIVE", insertedText: TEXT },
  });
  const phantomSession = await prisma.editSession.create({
    data: { documentId: doc.id, userId: instructor.id, startedAt: t1, endedAt: t1, characterCount: 120, source: "LIVE" },
  });
  const realSession = await prisma.editSession.create({
    data: { documentId: doc.id, userId: student.id, startedAt: t0, endedAt: t0, characterCount: 120, source: "LIVE" },
  });
  return { instructor, student, project, doc, real, phantom, phantomSession, realSession };
}

function runScript(args: string[]): { out: string; failed: boolean } {
  try {
    const out = execFileSync(process.execPath, [tsxCli, "scripts/auditPhantomInserts.ts", ...args], {
      cwd: serverDir,
      // dotenv/config never overrides variables already set, so the script talks to the test branch.
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL!, DIRECT_DATABASE_URL: process.env.DATABASE_URL! },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { out, failed: false };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, failed: true };
  }
}

describe("authorshipAudit (pure)", () => {
  it("measures the document text the way capture does", () => {
    expect(plainTextLengthOf(stateWith("hello world"))).toBe(11);
  });

  it("a whole-document phantom INSERT doubles the replayed characters; removing it reconciles", () => {
    const base = { documentId: 1, position: 0, length: 120, source: "LIVE", editType: "SUBSTANTIVE", insertedText: null, deletedText: null } as const;
    const events = [
      { ...base, id: 1, userId: 10, eventType: "INSERT", timestamp: new Date("2026-10-10") },
      { ...base, id: 2, userId: 99, eventType: "INSERT", timestamp: new Date("2026-10-19") },
    ] as never[];
    const s = summarizeEvents(events);
    expect(s.slotCount).toBe(240);
    expect(s.slotsByUser).toEqual({ 10: 120, 99: 120 });
    const c = findPhantomCandidates(events, 120);
    expect(c.map((x) => x.event.id)).toEqual([1, 2]);
    const phantom = c.find((x) => x.event.id === 2)!;
    expect(phantom.reconciles).toBe(true);
    expect(phantom.without.slotsByUser).toEqual({ 10: 120 });
  });
});

describe("scripts/auditPhantomInserts.ts", () => {
  it("dry run reports the mismatch and the reconciling candidate, and writes nothing", async () => {
    const { doc, phantom } = await seed();
    const { out, failed } = runScript(["--document", String(doc.id)]);
    expect(failed).toBe(false);
    expect(out).toContain(`Database host: ${new URL(process.env.DATABASE_URL!).host}`);
    expect(out).toContain(`Document ${doc.id}`);
    expect(out).toMatch(/replay slots=240\s+document text=120\s+MISMATCH \(120\)/);
    expect(out).toContain(`candidate: event #${phantom.id}`);
    expect(out).toContain("RECONCILES");
    expect(out).toContain("not a group member");
    expect(out).toContain("Dry run: nothing was written.");
    expect(await prisma.editEvent.count({ where: { documentId: doc.id } })).toBe(2);
  }, 90000);

  it("--apply refuses without explicit event ids, for a missing document, and for non-INSERT/unknown ids", async () => {
    const { doc } = await seed();
    expect(runScript(["--apply"]).failed).toBe(true);
    expect(runScript(["--apply", "--document", String(doc.id)]).out).toContain("explicit --event-ids");
    expect(runScript(["--event-ids", "1"]).out).toContain("only apply together with --apply");
    const unknown = runScript(["--apply", "--document", String(doc.id), "--event-ids", "999999999"]);
    expect(unknown.failed).toBe(true);
    expect(unknown.out).toContain("do not exist");
    expect(await prisma.editEvent.count({ where: { documentId: doc.id } })).toBe(2);
  }, 90000);

  it("--apply removes only the named event and session, prints before/after sums, and leaves the log consistent", async () => {
    const { doc, student, phantom, phantomSession, realSession } = await seed();
    const { out, failed } = runScript(["--document", String(doc.id), "--apply", "--event-ids", String(phantom.id), "--session-ids", String(phantomSession.id)]);
    expect(failed).toBe(false);
    expect(out).toContain("BEFORE");
    expect(out).toContain("AFTER (projected)");
    expect(out).toContain("AFTER (re-read from the database)");
    expect(out).toContain("Deleted 1 EditEvent row(s) and 1 EditSession row(s).");

    const events = await prisma.editEvent.findMany({ where: { documentId: doc.id } });
    expect(events.map((e) => e.userId)).toEqual([student.id]);
    expect(await prisma.editSession.findMany({ where: { documentId: doc.id } })).toEqual([expect.objectContaining({ id: realSession.id })]);
    expect(summarizeEvents(events).slotCount).toBe(120);

    // A session of another user cannot be removed along the way.
    const again = runScript(["--document", String(doc.id), "--apply", "--event-ids", String(events[0]!.id), "--session-ids", String(phantomSession.id), "--allow-unreconciled"]);
    expect(again.failed).toBe(true);
  }, 120000);

  it("--apply refuses when removing the named events would not reconcile the log", async () => {
    const { doc, real, phantom } = await seed();
    // Naming both leaves 0 replayed characters for a 120-character document.
    const r = runScript(["--document", String(doc.id), "--apply", "--event-ids", `${real.id},${phantom.id}`]);
    expect(r.failed).toBe(true);
    expect(r.out).toContain("Refusing");
    expect(await prisma.editEvent.count({ where: { documentId: doc.id } })).toBe(2);
  }, 90000);
});
