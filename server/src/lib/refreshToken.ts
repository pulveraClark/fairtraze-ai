import crypto from "crypto";
import { prisma } from "./prisma.js";

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueRefreshToken(userId: number): Promise<string> {
  const rawToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return rawToken;
}

export async function rotateRefreshToken(
  oldRawToken: string
): Promise<{ userId: number; newRawToken: string } | null> {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(oldRawToken) },
  });

  if (!existing || existing.expiresAt <= new Date()) {
    return null;
  }

  await prisma.refreshToken.delete({ where: { id: existing.id } });
  const newRawToken = await issueRefreshToken(existing.userId);
  return { userId: existing.userId, newRawToken };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await prisma.refreshToken
    .delete({ where: { tokenHash: hashToken(rawToken) } })
    .catch(() => {
      // Already gone / never existed — logout should still succeed.
    });
}
