import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { briefFingerprint, briefHash } from "../src/lib/aiReview/briefEvidence.js";

const app = createApp();
beforeEach(() => { process.env.AI_REVIEW_ENABLED = "true"; });
afterEach(() => { delete process.env.AI_REVIEW_ENABLED; });

const BRIEF = "The app has a login page.";

async function setup(opts: { status?: "OK" | "FAILED" | "SKIPPED"; requirements?: unknown[]; brief?: string } = {}) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: other } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "COMBINED" });
  const brief = opts.brief ?? BRIEF;
  await prisma.assignment.update({ where: { id: asg.id }, data: { description: brief } });
  const project = await createProject({ assignmentId: asg.id });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lia Leader" });
  const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Ben Reyes" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(ben.id, project.id);
  const report = await prisma.report.create({ data: { projectId: project.id, content: "{}" } });
  const requirements = opts.requirements ?? [
    { text: "Has a login page", status: "FOUND", evidence: [
      { type: "file", ref: "src/Login.tsx", quote: "export function Login()" },
      { type: "doc", ref: "Methodology", quote: "Ben wrote this sentence", authors: [ben.id] },
      { type: "doc", ref: "Intro", quote: "Lia wrote this sentence", authors: [leader.id] },
    ] },
    { text: "Has a survey", status: "NOT_FOUND", evidence: [] },
  ];
  await prisma.aiReportReview.create({
    data: {
      reportId: report.id, kind: "BRIEF_COMPARISON", status: opts.status ?? "OK", promptVersion: "brief-3", model: "m",
      briefHash: briefHash(BRIEF), errorCode: opts.status === "FAILED" ? "AI_UNAVAILABLE" : null,
      content: { requirements, aiAddressedCount: 2 },
    },
  });
  return { instructor, other, cls, asg, project, leader, ben, report };
}

const get = (id: number, u: unknown) => request(app).get(`/api/groups/${id}/ai-review`).set("Authorization", authHeaderFor(u as never));

describe("brief check visibility", () => {
  it("the instructor sees every quote and the AI-addressed count", async () => {
    const s = await setup();
    const b = (await get(s.project.id, s.instructor)).body.briefCheck;
    expect(b.requirements).toHaveLength(2);
    expect(b.requirements[0].evidence.map((e: { quote: string }) => e.quote)).toEqual(["export function Login()", "Ben wrote this sentence", "Lia wrote this sentence"]);
    expect(b.aiAddressedCount).toBe(2);
    expect(b.nothingFound).toBe(false);
    expect(b.outdated).toBe(false);
  });

  it("the leader sees the same requirements and code quotes; other members' Docs words are headings only; no AI-addressed count", async () => {
    const s = await setup();
    const res = await get(s.project.id, s.leader);
    const ev = res.body.briefCheck.requirements[0].evidence;
    expect(ev[0]).toMatchObject({ ref: "src/Login.tsx", quote: "export function Login()", quoteHidden: false });
    expect(ev[1]).toMatchObject({ ref: "Methodology", quote: "", quoteHidden: true });
    expect(ev[2]).toMatchObject({ ref: "Intro", quote: "Lia wrote this sentence", quoteHidden: false });
    expect(res.body.briefCheck).not.toHaveProperty("aiAddressedCount");
    expect(JSON.stringify(res.body)).not.toContain("Ben wrote this sentence");
    expect(JSON.stringify(res.body)).not.toContain("authors");
  });

  it("an ordinary member and outsiders never get it", async () => {
    const s = await setup();
    const member = await get(s.project.id, s.ben);
    expect(member.status).toBe(200);
    expect(member.body).not.toHaveProperty("briefCheck");
    expect(member.body).not.toHaveProperty("briefFailed");
    expect(JSON.stringify(member.body)).not.toMatch(/Has a login page|src\/Login/);
    expect((await get(s.project.id, s.other)).status).toBe(403);
  });

  it("hidden when the brief is empty or the run failed or was skipped; the instructor is told only about a failure", async () => {
    const empty = await setup({ brief: "  " });
    expect((await get(empty.project.id, empty.instructor)).body).not.toHaveProperty("briefCheck");

    const failed = await setup({ status: "FAILED", requirements: [] });
    const asInstructor = (await get(failed.project.id, failed.instructor)).body;
    expect(asInstructor).not.toHaveProperty("briefCheck");
    expect(asInstructor.briefFailed).toBe(true);
    const asLeader = (await get(failed.project.id, failed.leader)).body;
    expect(asLeader).not.toHaveProperty("briefCheck");
    expect(asLeader).not.toHaveProperty("briefFailed");

    const skipped = await setup({ status: "SKIPPED", requirements: [] });
    expect((await get(skipped.project.id, skipped.instructor)).body).not.toHaveProperty("briefCheck");
  });

  it("when nothing was found it is still shown, flagged nothingFound (the page shows one calm line)", async () => {
    const s = await setup({ requirements: [{ text: "Has a login page", status: "NOT_FOUND", evidence: [] }] });
    const b = (await get(s.project.id, s.leader)).body.briefCheck;
    expect(b.nothingFound).toBe(true);
    expect(b.requirements).toHaveLength(1);
  });

  it("zero requirements is hidden; a changed brief or a newer report marks it outdated", async () => {
    const none = await setup({ requirements: [] });
    expect((await get(none.project.id, none.instructor)).body).not.toHaveProperty("briefCheck");

    const s = await setup();
    await prisma.assignment.update({ where: { id: s.asg.id }, data: { description: "A different brief." } });
    expect((await get(s.project.id, s.instructor)).body.briefCheck.outdated).toBe(true);
    await prisma.assignment.update({ where: { id: s.asg.id }, data: { description: BRIEF } });
    expect((await get(s.project.id, s.instructor)).body.briefCheck.outdated).toBe(false);
    await prisma.report.create({ data: { projectId: s.project.id, content: "{}", generatedAt: new Date(Date.now() + 60_000) } });
    expect((await get(s.project.id, s.leader)).body.briefCheck.outdated).toBe(true);
  });

  describe("attached files", () => {
    const attach = (assignmentId: number, filename: string, order = 0) => {
      const data = Buffer.from(`%PDF-1.4 synthetic ${filename}`);
      return prisma.projectAttachment.create({
        data: { assignmentId, kind: "PDF", mime: "application/pdf", data, size: data.length, filename, order },
      });
    };
    const fingerprintOf = async (assignmentId: number, text: string) => {
      const metas = await prisma.projectAttachment.findMany({
        where: { assignmentId }, orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, size: true, mime: true },
      });
      return briefFingerprint(text, metas);
    };
    const storeHash = (reportId: number, hash: string) =>
      prisma.aiReportReview.updateMany({ where: { reportId, kind: "BRIEF_COMPARISON" }, data: { briefHash: hash } });

    it("shows the check when there is no written brief but there are attachments, and passes what was read to the instructor and the leader", async () => {
      const s = await setup({ brief: "  " });
      expect((await get(s.project.id, s.instructor)).body).not.toHaveProperty("briefCheck");
      await attach(s.asg.id, "brief.pdf");
      const sources = { writtenBrief: false, filesRead: 1, skipped: [{ filename: "big.png", reason: "TOO_LARGE" }] };
      await prisma.aiReportReview.updateMany({
        where: { reportId: s.report.id },
        data: { content: { requirements: [{ text: "Has a login page", status: "FOUND", evidence: [] }], aiAddressedCount: 0, sources } },
      });
      for (const viewer of [s.instructor, s.leader]) {
        const b = (await get(s.project.id, viewer)).body.briefCheck;
        expect(b.requirements).toHaveLength(1);
        expect(b.sources).toEqual(sources);
      }
      expect(JSON.stringify((await get(s.project.id, s.leader)).body)).not.toContain("synthetic");
    });

    it("passes each requirement's source (quote, file, page) to the instructor and the leader; a page needs a file", async () => {
      const s = await setup();
      await prisma.aiReportReview.updateMany({
        where: { reportId: s.report.id },
        data: { content: { aiAddressedCount: 0, sources: { writtenBrief: true, filesRead: 1, skipped: [], droppedCount: 2 }, requirements: [
          { text: "From the text", status: "NOT_FOUND", evidence: [], sourceQuote: "The app has a login page." },
          { text: "From the file", status: "NOT_FOUND", evidence: [], sourceFile: "brief.pdf", sourcePage: 3 },
          { text: "Odd page", status: "NOT_FOUND", evidence: [], sourceQuote: "The app has a login page.", sourcePage: 9 },
        ] } },
      });
      for (const viewer of [s.instructor, s.leader]) {
        const b = (await get(s.project.id, viewer)).body.briefCheck;
        expect(b.sources.droppedCount).toBe(2);
        expect(b.requirements[0]).toMatchObject({ sourceQuote: "The app has a login page." });
        expect(b.requirements[0]).not.toHaveProperty("sourceFile");
        expect(b.requirements[1]).toMatchObject({ sourceFile: "brief.pdf", sourcePage: 3 });
        expect(b.requirements[2]).not.toHaveProperty("sourcePage");
      }
    });

    it("tells only the instructor whether the project has instructions (text or a file)", async () => {
      const withText = await setup();
      expect((await get(withText.project.id, withText.instructor)).body.hasInstructions).toBe(true);

      const fileOnly = await setup({ brief: "  " });
      expect((await get(fileOnly.project.id, fileOnly.instructor)).body.hasInstructions).toBe(false);
      await attach(fileOnly.asg.id, "brief.pdf");
      expect((await get(fileOnly.project.id, fileOnly.instructor)).body.hasInstructions).toBe(true);

      const none = await setup({ brief: "" });
      expect((await get(none.project.id, none.instructor)).body.hasInstructions).toBe(false);
      for (const viewer of [withText.leader, withText.ben]) {
        expect((await get(withText.project.id, viewer)).body).not.toHaveProperty("hasInstructions");
      }
    });

    it("a check stored before sources existed still shapes, with no source fields", async () => {
      const s = await setup();
      const b = (await get(s.project.id, s.instructor)).body.briefCheck;
      expect(b.requirements).toHaveLength(2);
      for (const r of b.requirements) {
        expect(r).not.toHaveProperty("sourceQuote");
        expect(r).not.toHaveProperty("sourceFile");
        expect(r).not.toHaveProperty("sourcePage");
      }
      expect(b).not.toHaveProperty("nothingRead");
    });

    it("files attached but none readable and no written brief: the instructor and the leader get nothingRead with the reasons", async () => {
      const s = await setup({ status: "SKIPPED", requirements: [], brief: "" });
      await attach(s.asg.id, "scan.pdf");
      const sources = { writtenBrief: false, filesRead: 0, skipped: [{ filename: "scan.pdf", reason: "TOO_LARGE" }] };
      await prisma.aiReportReview.updateMany({
        where: { reportId: s.report.id },
        data: { content: { requirements: [], aiAddressedCount: 0, sources }, errorCode: "BRIEF_NOTHING_READ" },
      });
      await storeHash(s.report.id, await fingerprintOf(s.asg.id, ""));
      for (const viewer of [s.instructor, s.leader]) {
        const res = (await get(s.project.id, viewer)).body;
        expect(res.briefCheck).toMatchObject({ requirements: [], nothingFound: false, nothingRead: true, outdated: false, sources });
        expect(res).not.toHaveProperty("briefFailed");
      }
      expect((await get(s.project.id, s.ben)).body).not.toHaveProperty("briefCheck");
      // Adding a written brief later makes it outdated.
      await prisma.assignment.update({ where: { id: s.asg.id }, data: { description: "Now there is a written brief." } });
      expect((await get(s.project.id, s.instructor)).body.briefCheck.outdated).toBe(true);
    });

    it("a skipped run is still hidden when the written brief was read or nothing was skipped", async () => {
      const s = await setup({ status: "SKIPPED", requirements: [] });
      await attach(s.asg.id, "scan.pdf");
      await prisma.aiReportReview.updateMany({
        where: { reportId: s.report.id },
        data: { content: { requirements: [], aiAddressedCount: 0, sources: { writtenBrief: true, filesRead: 0, skipped: [{ filename: "scan.pdf", reason: "TOO_LARGE" }] } } },
      });
      expect((await get(s.project.id, s.instructor)).body).not.toHaveProperty("briefCheck");
      await prisma.aiReportReview.updateMany({
        where: { reportId: s.report.id },
        data: { content: { requirements: [], aiAddressedCount: 0, sources: { writtenBrief: false, filesRead: 0, skipped: [] } } },
      });
      expect((await get(s.project.id, s.instructor)).body).not.toHaveProperty("briefCheck");
    });

    it("a check stored before files were read has no sources and is not marked outdated by the fingerprint", async () => {
      const s = await setup();
      const b = (await get(s.project.id, s.instructor)).body.briefCheck;
      expect(b).not.toHaveProperty("sources");
      expect(b.outdated).toBe(false);
    });

    it("adding, removing or replacing an attachment marks the check outdated", async () => {
      const s = await setup();
      const first = await attach(s.asg.id, "brief.pdf");
      await storeHash(s.report.id, await fingerprintOf(s.asg.id, BRIEF));
      expect((await get(s.project.id, s.instructor)).body.briefCheck.outdated).toBe(false);

      await attach(s.asg.id, "extra.pdf", 1);
      expect((await get(s.project.id, s.instructor)).body.briefCheck.outdated).toBe(true);

      await storeHash(s.report.id, await fingerprintOf(s.asg.id, BRIEF));
      await prisma.projectAttachment.delete({ where: { id: first.id } });
      expect((await get(s.project.id, s.leader)).body.briefCheck.outdated).toBe(true);

      await storeHash(s.report.id, await fingerprintOf(s.asg.id, BRIEF));
      const remaining = await prisma.projectAttachment.findFirstOrThrow({ where: { assignmentId: s.asg.id } });
      await prisma.projectAttachment.delete({ where: { id: remaining.id } });
      await attach(s.asg.id, "extra.pdf", 1); // same name and size, new row
      expect((await get(s.project.id, s.instructor)).body.briefCheck.outdated).toBe(true);
    });

    it("the instructor is told about a failed run that had only attachments", async () => {
      const s = await setup({ status: "FAILED", requirements: [], brief: "" });
      await attach(s.asg.id, "brief.pdf");
      expect((await get(s.project.id, s.instructor)).body.briefFailed).toBe(true);
    });
  });

  it("is hidden along with everything else when the class switch is off", async () => {
    const s = await setup();
    await prisma.classSection.update({ where: { id: s.cls.id }, data: { aiReviewEnabled: false } });
    expect((await get(s.project.id, s.leader)).body).toEqual({ enabled: false });
  });
});
