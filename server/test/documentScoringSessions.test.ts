import { describe, it, expect } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { computeDocumentRawStats } from "../src/collab/editStats.js";
import { createProject, createUser } from "./factories.js";

// Only a session with typed (inserted) characters counts toward sessionCount, liveSessionCount and
// sessionDates. Delete-only and image-only sessions earn no session credit.
const rosterOf = (...users: { id: number; name: string }[]) =>
  users.map((u) => ({ userId: u.id, studentName: u.name, githubUsername: "" }));

async function setup() {
  const project = await createProject();
  const { user: a } = await createUser({ systemRole: "STUDENT" });
  const doc = await prisma.document.create({ data: { groupId: project.id } });
  return { doc, a };
}

const session = (documentId: number, userId: number, characterCount: number, imageInsertCount = 0, startedAt = new Date("2026-11-10T02:00:00Z")) =>
  prisma.editSession.create({ data: { documentId, userId, characterCount, imageInsertCount, startedAt } });

describe("computeDocumentRawStats — which sessions count", () => {
  it("a delete-only session (0 characters, 0 images) does not count", async () => {
    const { doc, a } = await setup();
    await session(doc.id, a.id, 0, 0);
    const s = (await computeDocumentRawStats(doc.id, rosterOf(a)))[0];
    expect(s.sessionCount).toBe(0);
    expect(s.liveSessionCount).toBe(0);
    expect(s.sessionDates).toEqual([]);
  });

  it("a typed session still counts, next to a delete-only one", async () => {
    const { doc, a } = await setup();
    await session(doc.id, a.id, 0, 0, new Date("2026-11-09T02:00:00Z"));
    await session(doc.id, a.id, 120, 0, new Date("2026-11-10T02:00:00Z"));
    const s = (await computeDocumentRawStats(doc.id, rosterOf(a)))[0];
    expect(s.sessionCount).toBe(1);
    expect(s.liveSessionCount).toBe(1);
    expect(s.sessionDates).toEqual(["2026-11-10T02:00:00.000Z"]);
  });

  it("an image-only session is still excluded", async () => {
    const { doc, a } = await setup();
    await session(doc.id, a.id, 0, 3);
    const s = (await computeDocumentRawStats(doc.id, rosterOf(a)))[0];
    expect(s.sessionCount).toBe(0);
    expect(s.sessionDates).toEqual([]);
    expect(s.insertedImageCount).toBe(3); // the gross image count is still shown
  });

  it("a session that typed and also inserted an image counts once", async () => {
    const { doc, a } = await setup();
    await session(doc.id, a.id, 40, 2);
    const s = (await computeDocumentRawStats(doc.id, rosterOf(a)))[0];
    expect(s.sessionCount).toBe(1);
  });
});
