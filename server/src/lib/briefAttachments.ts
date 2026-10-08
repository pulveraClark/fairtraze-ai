import type { AttachmentKind } from "@prisma/client";
import { prisma } from "./prisma.js";

// Project brief limits. Display-only data — never read by scoring, collab or analyze.
export const BRIEF_DESCRIPTION_MAX = 5000;
export const BRIEF_MAX_IMAGES = 5;
export const BRIEF_MAX_PDFS = 1;
export const BRIEF_IMAGE_MAX_BYTES = 1024 * 1024;
export const BRIEF_PDF_MAX_BYTES = 5 * 1024 * 1024;

export type BriefMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

/** Content-sniffs the bytes (the Content-Type header alone is not trusted). */
export function sniffBriefMime(buf: Buffer): BriefMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "%PDF") return "application/pdf";
  return null;
}

export function kindForMime(mime: BriefMime): AttachmentKind {
  return mime === "application/pdf" ? "PDF" : "IMAGE";
}

/**
 * Reduces a client-supplied filename to a safe ASCII basename for storage and for
 * Content-Disposition: no path parts, quotes, control chars or non-ASCII.
 */
export function sanitizeFilename(raw: unknown, fallback: string): string {
  const base = String(raw ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["';<>:*?|%\\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 100);
  return cleaned || fallback;
}

/** Owning instructor, admin, or a student enrolled in the assignment's class. */
export async function canViewBrief(
  user: { sub: number; role: string },
  assignmentId: number
): Promise<"ok" | "not-found" | "forbidden"> {
  const asg = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { classSectionId: true, classSection: { select: { instructorId: true } } },
  });
  if (!asg) return "not-found";
  if (user.role === "ADMIN") return "ok";
  if (user.role === "INSTRUCTOR") {
    return asg.classSection.instructorId === user.sub ? "ok" : "forbidden";
  }
  if (user.role === "STUDENT") {
    const enrolled = await prisma.classEnrollment.findUnique({
      where: { userId_classSectionId: { userId: user.sub, classSectionId: asg.classSectionId } },
      select: { id: true },
    });
    return enrolled ? "ok" : "forbidden";
  }
  return "forbidden";
}

export interface AttachmentMeta {
  id: number;
  kind: AttachmentKind;
  mime: string;
  filename: string;
  size: number;
  order: number;
}

/** Attachment metadata (never the bytes) per assignment, in display order. */
export async function attachmentMetaFor(assignmentIds: number[]): Promise<Map<number, AttachmentMeta[]>> {
  const out = new Map<number, AttachmentMeta[]>();
  if (assignmentIds.length === 0) return out;
  const rows = await prisma.projectAttachment.findMany({
    where: { assignmentId: { in: assignmentIds } },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { id: true, assignmentId: true, kind: true, mime: true, filename: true, size: true, order: true },
  });
  for (const { assignmentId, ...meta } of rows) {
    const list = out.get(assignmentId) ?? [];
    list.push(meta);
    out.set(assignmentId, list);
  }
  return out;
}
