import crypto from "crypto";
import { prisma } from "./prisma.js";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueVerificationToken(userId: number): Promise<string> {
  const rawToken = generateVerificationToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    },
  });
  return rawToken;
}

export async function consumeVerificationToken(rawToken: string): Promise<number | null> {
  const existing = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });

  if (!existing) return null;

  // Single-use: delete on lookup, not on successful verification, so the
  // token can never be replayed even if the request fails partway through.
  await prisma.emailVerificationToken.delete({ where: { id: existing.id } });

  if (existing.expiresAt <= new Date()) return null;

  return existing.userId;
}
