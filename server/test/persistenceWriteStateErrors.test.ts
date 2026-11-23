import { describe, it, expect, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { yjsPersistence } from "../src/collab/persistence.js";
import { createProject } from "./factories.js";

// y-websocket's closeConn calls persistence.writeState(...) with no .catch, so a rejection from the
// save is an unhandled rejection. writeState therefore never rejects: P2003 (the group is gone, e.g.
// deleted while its editor was open) is ignored quietly, any other error is logged with a fixed
// string and swallowed. What is saved on success is unchanged.

function docWithText(text: string): InstanceType<typeof Y.Doc> {
  const ydoc = new Y.Doc();
  const para = new Y.XmlElement("paragraph");
  const t = new Y.XmlText();
  t.insert(0, text);
  para.insert(0, [t]);
  ydoc.getXmlFragment("default").insert(0, [para]);
  return ydoc;
}

describe("persistence.ts - writeState error handling", () => {
  it("resolves without throwing when the group no longer exists (P2003)", async () => {
    const project = await createProject();
    const room = `group-doc-${project.id}`;
    await prisma.project.delete({ where: { id: project.id } });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(yjsPersistence.writeState(room, docWithText("text for a deleted group"))).resolves.toBeUndefined();
      expect(errorSpy).not.toHaveBeenCalled(); // quiet
    } finally {
      errorSpy.mockRestore();
    }
    expect(await prisma.document.findUnique({ where: { groupId: project.id } })).toBeNull();
  }, 30000);

  it("logs a fixed string (no error object) and does not throw on any other error", async () => {
    const project = await createProject();
    const room = `group-doc-${project.id}`;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Not vi.spyOn(...).mockRestore(): on a Prisma delegate that leaves `upsert` undefined for the
    // next test (confirmed). Assign and put back the original instead, as persistenceRestoreRace does.
    const originalUpsert = prisma.document.upsert.bind(prisma.document);
    prisma.document.upsert = (async () => {
      throw new Error("boom secret detail");
    }) as unknown as typeof prisma.document.upsert;
    try {
      await expect(yjsPersistence.writeState(room, docWithText("x"))).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]).toEqual([`[collab] persist failed for ${room}`]);
    } finally {
      prisma.document.upsert = originalUpsert as typeof prisma.document.upsert;
      errorSpy.mockRestore();
    }
  }, 30000);

  it("still stores exactly the encoded state on a normal save", async () => {
    const project = await createProject();
    const room = `group-doc-${project.id}`;
    const ydoc = docWithText("a normal save keeps these exact bytes");

    await yjsPersistence.writeState(room, ydoc);

    const row = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(row?.yjsState).toBeTruthy();
    expect(Buffer.compare(Buffer.from(row!.yjsState!), Buffer.from(Y.encodeStateAsUpdate(ydoc)))).toBe(0);
  }, 30000);
});
