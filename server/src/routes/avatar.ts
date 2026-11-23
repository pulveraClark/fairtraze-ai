import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const avatarRouter = Router();

export const AVATAR_MAX_BYTES = 200 * 1024;

/** Content-sniffs the bytes (the Content-Type header alone is not trusted). */
export function sniffAvatarMime(buf: Buffer): "image/jpeg" | "image/webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) return "image/webp";
  return null;
}

// Reject a body-too-large from express.raw as a clean 413 instead of a stack trace.
export function avatarBodyErrors(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if ((err as { type?: string })?.type === "entity.too.large") {
    res.status(413).json({ error: "Photo is too large (max 200 KB)." });
    return;
  }
  next(err);
}

// PUT /api/users/me/avatar — raw JPEG/WebP body. The body parser is registered in app.ts.
avatarRouter.put("/api/users/me/avatar", requireAuth, async (req, res) => {
  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: "Send a JPEG or WebP image." });
    return;
  }
  if (body.length > AVATAR_MAX_BYTES) {
    res.status(413).json({ error: "Photo is too large (max 200 KB)." });
    return;
  }
  const mime = sniffAvatarMime(body);
  if (!mime) {
    res.status(400).json({ error: "Only JPEG or WebP photos are accepted." });
    return;
  }
  const updated = await prisma.user.update({
    where:  { id: req.user!.sub },
    data:   { avatarData: new Uint8Array(body), avatarMime: mime, avatarUpdatedAt: new Date() },
    select: { avatarUpdatedAt: true },
  });
  res.json({ avatarUpdatedAt: updated.avatarUpdatedAt!.toISOString() });
});

// DELETE /api/users/me/avatar
avatarRouter.delete("/api/users/me/avatar", requireAuth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user!.sub },
    data:  { avatarData: null, avatarMime: null, avatarUpdatedAt: null },
  });
  res.json({ avatarUpdatedAt: null });
});

/** Self, admin, a group-mate, or the instructor of a class the user belongs to. */
async function canViewAvatar(viewerId: number, viewerRole: string, targetId: number): Promise<boolean> {
  if (viewerId === targetId || viewerRole === "ADMIN") return true;

  const mates = await prisma.groupMembership.findFirst({
    where: {
      userId: targetId,
      project: { groupMemberships: { some: { userId: viewerId } } },
    },
    select: { id: true },
  });
  if (mates) return true;

  if (viewerRole === "INSTRUCTOR") {
    const taught = await prisma.classSection.findFirst({
      where: {
        instructorId: viewerId,
        OR: [
          { enrollments: { some: { userId: targetId } } },
          { assignments: { some: { projects: { some: { groupMemberships: { some: { userId: targetId } } } } } } },
        ],
      },
      select: { id: true },
    });
    if (taught) return true;
  }
  return false;
}

// GET /api/users/:id/avatar — authenticated, cacheable. Clients append ?v=<avatarUpdatedAt>.
avatarRouter.get("/api/users/:id/avatar", requireAuth, async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  if (!(await canViewAvatar(req.user!.sub, req.user!.role, targetId))) {
    res.status(403).json({ error: "You do not have access to this photo." });
    return;
  }
  const user = await prisma.user.findUnique({
    where:  { id: targetId },
    select: { avatarData: true, avatarMime: true, avatarUpdatedAt: true },
  });
  if (!user?.avatarData || !user.avatarMime || !user.avatarUpdatedAt) {
    res.status(404).json({ error: "No photo." });
    return;
  }
  const etag = `"av-${targetId}-${user.avatarUpdatedAt.getTime()}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  res.setHeader("Content-Type", user.avatarMime);
  res.send(Buffer.from(user.avatarData));
});
