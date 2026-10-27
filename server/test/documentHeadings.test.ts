import { describe, it, expect } from "vitest";
import request from "supertest";
import { Y } from "../src/collab/yjsCjs.js";
import { createApp } from "../src/app.js";
import { extractHeadings } from "../src/lib/documentHeadings.js";
import { prisma } from "../src/lib/prisma.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

const app = createApp();

function textEl(name: string, text: string, attrs: Record<string, unknown> = {}) {
  const el = new Y.XmlElement(name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v as string);
  const t = new Y.XmlText();
  t.insert(0, text);
  el.insert(0, [t]);
  return el;
}

function stateWithHeadings(): Uint8Array {
  const ydoc = new Y.Doc();
  ydoc.transact(() => {
    const marked = new Y.XmlElement("heading");
    marked.setAttribute("level", 2 as unknown as string);
    const mt = new Y.XmlText();
    mt.insert(0, "Methods and tools");
    mt.format(0, 7, { bold: true });
    marked.insert(0, [mt]);

    const inCell = new Y.XmlElement("tableCell");
    inCell.insert(0, [textEl("heading", "Inside a table", { level: 1 })]);
    const row = new Y.XmlElement("tableRow");
    row.insert(0, [inCell]);
    const table = new Y.XmlElement("table");
    table.insert(0, [row]);

    ydoc.getXmlFragment("default").insert(0, [
      textEl("heading", "Introduction", { level: 1 }),
      textEl("paragraph", "Body text that is not a heading."),
      marked,
      textEl("heading", "Too deep", { level: 3 }),
      textEl("heading", "   ", { level: 1 }),
      table,
    ]);
  });
  return Y.encodeStateAsUpdate(ydoc);
}

describe("extractHeadings", () => {
  it("returns H1/H2 text in document order, ignoring marks, H3+, blank headings and body text", () => {
    expect(extractHeadings({ content: "{}", yjsState: stateWithHeadings() })).toEqual([
      { level: 1, text: "Introduction" },
      { level: 2, text: "Methods and tools" },
      { level: 1, text: "Inside a table" },
    ]);
  });

  it("falls back to the legacy content when there is no Yjs state", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "From legacy" }] },
        { type: "paragraph" },
      ],
    });
    expect(extractHeadings({ content, yjsState: null })).toEqual([{ level: 1, text: "From legacy" }]);
  });
});

async function setup(sourceType: "EDITOR" | "COMBINED" | "GITHUB" = "EDITOR") {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType });
  const project = await createProject({ assignmentId: asg.id });
  const { user: leader } = await createUser({ systemRole: "STUDENT" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT" });
  const { user: admin } = await createUser({ systemRole: "ADMIN" });
  const { user: otherInstructor } = await createUser({ systemRole: "INSTRUCTOR" });
  await createMembership(leader.id, project.id, "LEADER");
  return { instructor, leader, outsider, admin, otherInstructor, project };
}

const get = (u: Parameters<typeof authHeaderFor>[0], id: number) =>
  request(app).get(`/api/groups/${id}/document/headings`).set("Authorization", authHeaderFor(u));

describe("GET /api/groups/:id/document/headings", () => {
  it("returns the persisted headings for members and the owning instructor; 403 for others, admins included", async () => {
    const { leader, instructor, admin, outsider, otherInstructor, project } = await setup();
    await prisma.document.create({ data: { groupId: project.id, yjsState: Buffer.from(stateWithHeadings()) } });
    for (const u of [leader, instructor]) {
      const res = await get(u, project.id);
      expect(res.status).toBe(200);
      expect(res.body.headings.map((h: { text: string }) => h.text)).toEqual(["Introduction", "Methods and tools", "Inside a table"]);
    }
    expect((await get(admin, project.id)).status).toBe(403);
    expect((await get(outsider, project.id)).status).toBe(403);
    expect((await get(otherInstructor, project.id)).status).toBe(403);
    expect((await request(app).get(`/api/groups/${project.id}/document/headings`)).status).toBe(401);
    expect((await get(leader, 999999)).status).toBe(404);
  });

  it("is strictly read-only: no document row created, no yjsState, EditEvent or session change", async () => {
    const { leader, project } = await setup();
    // No document yet: answers with an empty list and does NOT create the row (the template picker stays).
    const empty = await get(leader, project.id);
    expect(empty.status).toBe(200);
    expect(empty.body.headings).toEqual([]);
    expect(await prisma.document.count()).toBe(0);

    const doc = await prisma.document.create({ data: { groupId: project.id, yjsState: Buffer.from(stateWithHeadings()) } });
    const before = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    await get(leader, project.id);
    await get(leader, project.id);
    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(Buffer.compare(Buffer.from(after.yjsState!), Buffer.from(before.yjsState!))).toBe(0);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.content).toBe(before.content);
    expect(await prisma.editEvent.count()).toBe(0);
    expect(await prisma.editSession.count()).toBe(0);
  });

  it("returns no headings for a GitHub-only assignment", async () => {
    const { leader, project } = await setup("GITHUB");
    const res = await get(leader, project.id);
    expect(res.status).toBe(200);
    expect(res.body.headings).toEqual([]);
  });
});
