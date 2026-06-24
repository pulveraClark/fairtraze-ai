import { prisma } from "./prisma.js";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomSegment(len: number): string {
  return Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
}

export async function generateUniqueJoinCode(): Promise<string> {
  for (;;) {
    const code = `FT-${randomSegment(4)}-${randomSegment(4)}`;
    // Check both tables to guarantee global uniqueness across ClassSection and Assignment
    const [existingAssignment, existingClass] = await Promise.all([
      prisma.assignment.findUnique({ where: { joinCode: code } }),
      prisma.classSection.findFirst({ where: { joinCode: code } }),
    ]);
    if (!existingAssignment && !existingClass) return code;
  }
}
