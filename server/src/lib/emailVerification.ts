import crypto from "crypto";
import { prisma } from "./prisma.js";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// First key of the two-int advisory lock, so it cannot collide with another feature's lock on the same user id
// (the password reset uses 7301).
const VERIFY_LOCK_NAMESPACE = 7302;

function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueVerificationToken(userId: number): Promise<string> {
  const rawToken = generateVerificationToken();
  // A new link cancels every older unused link for this user, so only the latest one works. The per-user
  // advisory lock makes two simultaneous requests take turns (same pattern as issueResetToken).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VERIFY_LOCK_NAMESPACE}::int, ${userId}::int)`;
    await tx.emailVerificationToken.deleteMany({ where: { userId } });
    await tx.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      },
    });
    // A cold database connection can take longer than Prisma's 2 s default to hand out a transaction.
  }, { maxWait: 10_000, timeout: 10_000 });
  return rawToken;
}

export async function consumeVerificationToken(rawToken: string): Promise<number | null> {
  // Single-use: one DELETE ... RETURNING statement, so of two simultaneous requests exactly one gets the row
  // and the other gets nothing (a find-then-delete let the loser throw a 500). Deleted on lookup, not on a
  // successful update, so the token can never be replayed even if the request fails partway through.
  const rows = await prisma.$queryRaw<{ userId: number; expiresAt: Date }[]>`
    DELETE FROM "EmailVerificationToken"
    WHERE "tokenHash" = ${hashToken(rawToken)}
    RETURNING "userId", "expiresAt"`;

  const consumed = rows[0];
  if (!consumed) return null;
  if (consumed.expiresAt <= new Date()) return null;

  return consumed.userId;
}

/**
 * Read-only: is this link still usable right now? True only if the row exists and has not expired.
 * Never deletes or changes anything, so opening the page (or an email scanner fetching the link) cannot
 * use the link up. The caller answers the same shape for unknown, used and expired tokens.
 */
export async function peekVerificationToken(rawToken: string): Promise<boolean> {
  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { expiresAt: true },
  });
  return !!row && row.expiresAt > new Date();
}
