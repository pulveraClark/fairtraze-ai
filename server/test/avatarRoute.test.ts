import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

const app = createApp();

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(50, 2)]);

type U = Parameters<typeof authHeaderFor>[0];

async function upload(user: U, body: Buffer, type = "image/jpeg") {
  return request(app).put("/api/users/me/avatar").set("Authorization", authHeaderFor(user)).set("Content-Type", type).send(body);
}

describe("profile photo routes", () => {
  it("accepts a valid JPEG and WebP, serves it with ETag, and 304s on revalidation", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    expect((await upload(user, JPEG)).status).toBe(200);
    expect((await upload(user, WEBP, "image/webp")).status).toBe(200);

    const res = await request(app).get(`/api/users/${user.id}/avatar`).set("Authorization", authHeaderFor(user));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/webp");
    expect(res.headers["cache-control"]).toContain("private");
    const etag = res.headers.etag as string;
    const again = await request(app).get(`/api/users/${user.id}/avatar`)
      .set("Authorization", authHeaderFor(user)).set("If-None-Match", etag);
    expect(again.status).toBe(304);
  });

  it("rejects wrong magic bytes, empty and oversize bodies", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    expect((await upload(user, Buffer.from("not an image at all"))).status).toBe(400);
    expect((await upload(user, Buffer.concat([JPEG, Buffer.alloc(210 * 1024)]))).status).toBe(413);
    expect((await upload(user, Buffer.alloc(300 * 1024, 0xff))).status).toBe(413);
  });

  it("requires auth and DELETE removes the photo", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    expect((await request(app).put("/api/users/me/avatar").set("Content-Type", "image/jpeg").send(JPEG)).status).toBe(401);
    await upload(user, JPEG);
    expect((await request(app).delete("/api/users/me/avatar").set("Authorization", authHeaderFor(user))).status).toBe(200);
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    expect(row?.avatarData).toBeNull();
    expect((await request(app).get(`/api/users/${user.id}/avatar`).set("Authorization", authHeaderFor(user))).status).toBe(404);
  });

  it("authorization: group-mate and class instructor allowed; outsider and other instructor forbidden", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: otherInstructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const cls = await createClassSection(instructor.id);
    const asg = await createAssignment(cls.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: asg.id });
    const { user: owner } = await createUser({ systemRole: "STUDENT" });
    const { user: mate } = await createUser({ systemRole: "STUDENT" });
    const { user: outsider } = await createUser({ systemRole: "STUDENT" });
    await createMembership(owner.id, project.id, "LEADER");
    await createMembership(mate.id, project.id, "MEMBER");
    await upload(owner, JPEG);

    const get = (u: U) => request(app).get(`/api/users/${owner.id}/avatar`).set("Authorization", authHeaderFor(u));
    expect((await get(mate)).status).toBe(200);
    expect((await get(instructor)).status).toBe(200);
    expect((await get(outsider)).status).toBe(403);
    expect((await get(otherInstructor)).status).toBe(403);
  });
});
