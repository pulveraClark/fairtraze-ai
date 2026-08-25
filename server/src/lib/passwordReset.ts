import crypto from "crypto";
import { prisma } from "./prisma.js";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueResetToken(userId: number): Promise<string> {
  const rawToken = generateResetToken();
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });
  return rawToken;
}

export async function consumeResetToken(rawToken: string): Promise<number | null> {
  const existing = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });

  if (!existing) return null;

  // Single-use: delete on lookup, not on successful password update, so the
  // token can never be replayed even if the request fails partway through.
  await prisma.passwordResetToken.delete({ where: { id: existing.id } });

  if (existing.expiresAt <= new Date()) return null;

  return existing.userId;
}
