import { prisma } from "./prisma.js";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomSegment(len: number): string {
  return Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
}

export async function generateUniqueJoinCode(): Promise<string> {
  for (;;) {
    const code = `FT-${randomSegment(4)}-${randomSegment(4)}`;
    const existing = await prisma.assignment.findUnique({ where: { joinCode: code } });
    if (!existing) return code;
  }
}
