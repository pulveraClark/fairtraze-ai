import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { anonymizeUser } from "../src/lib/anonymizeUser.js";
import { parseDateOnly } from "../src/lib/taskBoard.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

// Phase 8: every kind of task data is in the personal-data export, and erasure removes the person's
// identity from it without changing any task, comment, count or score. Attachment bytes are kept.

const app = createApp();

const NAME = "Juan Dela Cruz";
const EMAIL = "juan.delacruz@uclm.edu.ph";
const LOGIN = "jdelacruz";
const BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3, 4, 5]); // "%PDF-" + payload

async function seed() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: admin } = await createUser({ systemRole: "ADMIN", name: "Admin Ada" });
  const cs = await createClassSection(instructor.id);
  const asgn = await createAssignment(cs.id, { sourceType: "COMBINED" });
  const project = await createProject({ assignmentId: asgn.id });
  const { user: maria } = await createUser({ systemRole: "STUDENT", name: "Maria Santos", email: "maria@uclm.edu.ph" });
  const { user: juan } = await createUser({ systemRole: "STUDENT", name: NAME, email: EMAIL });
  await prisma.user.update({ where: { id: juan.id }, data: { githubUsername: LOGIN } });
  await prisma.user.update({ where: { id: maria.id }, data: { githubUsername: "msantos" } });
  await createMembership(maria.id, project.id, "LEADER");
  await createMembership(juan.id, project.id);

  const milestone = await prisma.taskMilestone.create({ data: { projectId: project.id, name: "Alpha release", position: 1 } });
  const label = await prisma.taskLabel.create({ data: { projectId: project.id, name: "frontend", color: "blue" } });

  // T1: created by Juan, assigned to Maria; his name is in the text.
  const t1 = await prisma.task.create({
    data: {
      projectId: project.id, number: 1, title: `Slides by ${NAME}`, description: `Ask ${NAME} (${LOGIN}) for the template`,
      createdByUserId: juan.id, assignedToUserId: maria.id, position: 1024,
    },
  });
  // T2: created by Maria, assigned to Juan, with status, priority, due date, milestone, label.
  const t2 = await prisma.task.create({
    data: {
      projectId: project.id, number: 2, title: "Write the intro", description: `Review with <@${juan.id}> please`,
      createdByUserId: maria.id, assignedToUserId: juan.id, position: 2048, status: "IN_REVIEW", priority: "HIGH",
      dueDate: parseDateOnly("2026-11-20"), milestoneId: milestone.id, labelLinks: { create: [{ labelId: label.id }] },
    },
  });
  // T3: Maria's own task, nothing to do with Juan.
  const t3 = await prisma.task.create({ data: { projectId: project.id, number: 3, title: "Maria private task", createdByUserId: maria.id, position: 3072 } });

  await prisma.taskComment.create({ data: { taskId: t2.id, authorId: juan.id, body: "I will take it, <@" + maria.id + ">" } });
  await prisma.taskComment.create({ data: { taskId: t2.id, authorId: maria.id, body: `Thanks ${NAME}! <@${juan.id}> please send it by Friday` } });
  await prisma.taskComment.create({ data: { taskId: t3.id, authorId: maria.id, body: "Secret plan for Maria only" } });

  await prisma.taskSubtask.create({ data: { taskId: t1.id, title: `Check with ${NAME}`, position: 1 } });
  await prisma.taskSubtask.create({ data: { taskId: t3.id, title: "Maria subtask", position: 1 } });

  const fJuan = await prisma.taskAttachment.create({
    data: { taskId: t2.id, projectId: project.id, kind: "PDF", mime: "application/pdf", filename: `${NAME} draft.pdf`, size: BYTES.length, data: new Uint8Array(BYTES), createdById: juan.id },
  });
  const fMaria = await prisma.taskAttachment.create({
    data: { taskId: t3.id, projectId: project.id, kind: "PDF", mime: "application/pdf", filename: "maria-notes.pdf", size: BYTES.length, data: new Uint8Array(BYTES), createdById: maria.id },
  });

  await prisma.taskWatcher.createMany({ data: [{ taskId: t2.id, userId: juan.id }, { taskId: t2.id, userId: maria.id }, { taskId: t3.id, userId: maria.id }] });
  await prisma.taskNotificationLog.create({ data: { taskId: t2.id, userId: juan.id, kind: "DUE_SOON", dueDate: parseDateOnly("2026-11-20")! } });
  await prisma.taskNotificationLog.create({ data: { taskId: t3.id, userId: maria.id, kind: "OVERDUE", dueDate: parseDateOnly("2026-10-01")! } });

  const linkJuan = await prisma.taskCommitLink.create({
    data: { taskId: t2.id, repo: "acme/app", sha: "a41f9c2d", message: `FT-2 intro, pair with ${NAME}`, authorLogin: LOGIN, committedAt: new Date("2026-10-12T02:00:00Z") },
  });
  const linkMaria = await prisma.taskCommitLink.create({
    data: { taskId: t1.id, repo: "acme/app", sha: "b52e0d3e", message: "FT-1 slides", authorLogin: "msantos", committedAt: new Date("2026-10-13T02:00:00Z") },
  });

  await prisma.taskActivity.createMany({
    data: [
      { taskId: t2.id, actorId: juan.id, type: "status_changed", data: { from: "TODO", to: "IN_REVIEW" } },
      { taskId: t2.id, actorId: maria.id, type: "assigned", data: { to: juan.id } },
      { taskId: t2.id, actorId: juan.id, type: "attachment_added", data: { filename: `${NAME} draft.pdf` } },
      { taskId: t1.id, actorId: juan.id, type: "subtask_added", data: { title: `Check with ${NAME}` } },
      { taskId: t2.id, actorId: null, type: "commit_linked", data: { sha: "a41f9c2d", authorLogin: LOGIN } },
      { taskId: t1.id, actorId: null, type: "commit_linked", data: { sha: "b52e0d3e", authorLogin: "msantos" } },
    ],
  });

  return { admin, maria, juan, project, t1, t2, t3, fJuan, fMaria, linkJuan, linkMaria };
}

const exportOf = async (u: Parameters<typeof authHeaderFor>[0]) => {
  const res = await request(app).get("/api/privacy/export").set("Authorization", authHeaderFor(u));
  expect(res.status).toBe(200);
  return { body: JSON.parse(res.text), raw: res.text };
};

describe("personal-data export: task data", () => {
  it("includes the person's own task data and nothing of another member's", async () => {
    const { juan, maria, t2 } = await seed();
    const { body, raw } = await exportOf(juan);

    // Tasks created by or assigned to Juan, with status, priority, due date, milestone and labels.
    expect(body.tasks.map((t: { title: string }) => t.title).sort()).toEqual(["Slides by Juan Dela Cruz", "Write the intro"]);
    const intro = body.tasks.find((t: { id: number }) => t.id === t2.id);
    expect(intro).toMatchObject({ status: "IN_REVIEW", priority: "HIGH", dueDate: "2026-11-20", milestone: "Alpha release", labels: ["frontend"], number: 2 });

    expect(body.taskComments.map((c: { body: string }) => c.body)).toEqual([`I will take it, <@${maria.id}>`]);
    expect(body.taskWatches.map((w: { taskId: number }) => w.taskId)).toEqual([t2.id]);
    expect(body.taskActivityByYou.map((a: { type: string }) => a.type).sort()).toEqual(["attachment_added", "status_changed", "subtask_added"]);

    // Messages addressed to him with @mention (text only, no author identity), and none of his own.
    expect(body.taskMentionsOfMe.inComments.map((c: { body: string }) => c.body)).toEqual([`Thanks ${NAME}! <@${juan.id}> please send it by Friday`]);
    expect(body.taskMentionsOfMe.inComments[0].authorId).toBeUndefined();
    expect(body.taskMentionsOfMe.inDescriptions.map((d: { text: string }) => d.text)).toEqual([`Review with <@${juan.id}> please`]);

    // Commits that carry his login, not Maria's.
    expect(body.taskCommitLinks).toHaveLength(1);
    expect(body.taskCommitLinks[0]).toMatchObject({ sha: "a41f9c2d", repo: "acme/app" });

    // Attachments: metadata only, never the bytes; only the ones he added.
    expect(body.taskAttachments).toHaveLength(1);
    expect(body.taskAttachments[0]).toMatchObject({ filename: `${NAME} draft.pdf`, kind: "PDF", size: BYTES.length });
    expect(body.taskAttachments[0].data).toBeUndefined();

    for (const leak of ["Maria private task", "Secret plan", "maria-notes", "maria@uclm.edu.ph", "msantos", "b52e0d3e", "Maria subtask"]) {
      expect(raw, leak).not.toContain(leak);
    }
  });

  it("is empty (not an error) for someone with no task data", async () => {
    const { admin } = await seed();
    const { body } = await exportOf(admin);
    expect(body.tasks).toEqual([]);
    expect(body.taskWatches).toEqual([]);
    expect(body.taskActivityByYou).toEqual([]);
    expect(body.taskMentionsOfMe).toEqual({ inComments: [], inDescriptions: [] });
    expect(body.taskCommitLinks).toEqual([]);
  });

  it("leaves out commit links when the person has no GitHub username", async () => {
    const { maria } = await seed();
    await prisma.user.update({ where: { id: maria.id }, data: { githubUsername: null } });
    const { body } = await exportOf(maria);
    expect(body.taskCommitLinks).toEqual([]);
  });
});

describe("erasure: task data", () => {
  it("removes the person's identity from task text, files, commits and History, and changes nothing else", async () => {
    const { admin, juan, maria, project, t1, t2, t3, fJuan, fMaria, linkJuan, linkMaria } = await seed();
    const counts = async () => ({
      tasks: await prisma.task.count(), comments: await prisma.taskComment.count(), subtasks: await prisma.taskSubtask.count(),
      files: await prisma.taskAttachment.count(), links: await prisma.taskCommitLink.count(), activity: await prisma.taskActivity.count(),
    });
    const before = await counts();
    const mariaFile = await prisma.taskAttachment.findUniqueOrThrow({ where: { id: fMaria.id } });

    const result = await anonymizeUser(juan.id, { actorId: admin.id, actorName: admin.name, action: "USER_ANONYMIZED" });
    expect(result).toEqual({ ok: true });
    expect(await counts()).toEqual(before); // nothing deleted: tasks, comments, files, links, History all stay

    // Task text: his name and login are gone, other words stay.
    const task1 = await prisma.task.findUniqueOrThrow({ where: { id: t1.id } });
    expect(task1.title).toBe("Slides by Former member");
    expect(task1.description).not.toContain(NAME);
    expect(task1.description).not.toContain(LOGIN);
    expect(task1.description).toContain("for the template");
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t3.id } })).title).toBe("Maria private task");
    // Mention tokens are ids, so they need no rewrite and still point at the (now anonymous) person.
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t2.id } })).description).toBe(`Review with <@${juan.id}> please`);

    // Teammate's comment that used his name in plain text is scrubbed; her mention token and her other text are untouched.
    const comments = await prisma.taskComment.findMany({ where: { taskId: t2.id }, orderBy: { id: "asc" } });
    expect(comments[1]!.body).toBe(`Thanks Former member! <@${juan.id}> please send it by Friday`);
    expect(comments[1]!.authorId).toBe(maria.id);
    expect((await prisma.taskComment.findFirstOrThrow({ where: { taskId: t3.id } })).body).toBe("Secret plan for Maria only");

    const sub = await prisma.taskSubtask.findFirstOrThrow({ where: { taskId: t1.id } });
    expect(sub.title).toBe("Check with Former member");
    expect((await prisma.taskSubtask.findFirstOrThrow({ where: { taskId: t3.id } })).title).toBe("Maria subtask");

    // Attachments: file name scrubbed, bytes KEPT, still the same file, still on the same task.
    const file = await prisma.taskAttachment.findUniqueOrThrow({ where: { id: fJuan.id } });
    expect(file.filename).toBe("Former member draft.pdf");
    expect(Buffer.compare(Buffer.from(file.data), BYTES)).toBe(0);
    expect(file.size).toBe(BYTES.length);
    expect(file.taskId).toBe(t2.id);
    const mariaFileAfter = await prisma.taskAttachment.findUniqueOrThrow({ where: { id: fMaria.id } });
    expect(mariaFileAfter.filename).toBe("maria-notes.pdf");
    expect(Buffer.compare(Buffer.from(mariaFileAfter.data), Buffer.from(mariaFile.data))).toBe(0);

    // Commit links: his login removed and his name scrubbed from the message; Maria's link untouched.
    const lj = await prisma.taskCommitLink.findUniqueOrThrow({ where: { id: linkJuan.id } });
    expect(lj.authorLogin).toBeNull();
    expect(lj.message).toBe("FT-2 intro, pair with Former member");
    expect(lj.sha).toBe("a41f9c2d");
    const lm = await prisma.taskCommitLink.findUniqueOrThrow({ where: { id: linkMaria.id } });
    expect(lm).toMatchObject({ authorLogin: "msantos", message: "FT-1 slides" });

    // History: ids and values stay; the free-text values are scrubbed.
    const activity = await prisma.taskActivity.findMany({ where: { taskId: { in: [t1.id, t2.id] } } });
    const dump = JSON.stringify(activity);
    for (const s of [NAME, LOGIN, EMAIL]) expect(dump).not.toContain(s);
    expect(activity.find((a) => a.type === "status_changed")?.data).toEqual({ from: "TODO", to: "IN_REVIEW" });
    expect(activity.find((a) => a.type === "assigned")?.data).toEqual({ to: juan.id });
    expect(activity.find((a) => a.type === "commit_linked" && (a.data as { sha: string }).sha === "a41f9c2d")?.data).toEqual({ sha: "a41f9c2d", authorLogin: null });
    expect(activity.find((a) => a.type === "commit_linked" && (a.data as { sha: string }).sha === "b52e0d3e")?.data).toEqual({ sha: "b52e0d3e", authorLogin: "msantos" });

    // Personal rows with no value are gone: his watches and reminder log. Maria's stay.
    expect(await prisma.taskWatcher.count({ where: { userId: juan.id } })).toBe(0);
    expect(await prisma.taskWatcher.count({ where: { userId: maria.id } })).toBe(2);
    expect(await prisma.taskNotificationLog.count({ where: { userId: juan.id } })).toBe(0);
    expect(await prisma.taskNotificationLog.count({ where: { userId: maria.id } })).toBe(1);

    // The tasks still belong to the (tombstone) user, so counts and ownership are unchanged.
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t1.id } })).createdByUserId).toBe(juan.id);
    expect(project.id).toBeGreaterThan(0);
  });

  it("does nothing to task data of a person who is in no group", async () => {
    const { admin } = await seed();
    const { user: loner } = await createUser({ systemRole: "STUDENT", name: "Lone Wolf", email: "lone@uclm.edu.ph" });
    const before = await prisma.task.count();
    expect(await anonymizeUser(loner.id, { actorId: admin.id, actorName: admin.name, action: "USER_ANONYMIZED" })).toEqual({ ok: true });
    expect(await prisma.task.count()).toBe(before);
  });
});
