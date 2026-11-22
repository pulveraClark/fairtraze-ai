import crypto from "crypto";
import { prisma } from "./prisma.js";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

// First key of the two-int advisory lock, so it cannot collide with another feature's lock on the same user id.
const RESET_LOCK_NAMESPACE = 7301;

function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueResetToken(userId: number): Promise<string> {
  const rawToken = generateResetToken();
  // A new request cancels every older unused link for this user, so only the latest one works.
  // The per-user advisory lock makes two simultaneous requests take turns: without it both could delete
  // first and then both create, leaving two live links. Same pattern as the group join check (groups.ts).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RESET_LOCK_NAMESPACE}::int, ${userId}::int)`;
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    // A cold database connection can take longer than Prisma's 2 s default to hand out a transaction.
  }, { maxWait: 10_000, timeout: 10_000 });
  return rawToken;
}

export async function consumeResetToken(rawToken: string): Promise<number | null> {
  // Single-use: one DELETE ... RETURNING statement, so of two simultaneous requests exactly one gets the row
  // and the other gets nothing (a find-then-delete let the loser throw a 500). Deleted on lookup, not on a
  // successful password update, so the token can never be replayed even if the request fails partway through.
  const rows = await prisma.$queryRaw<{ userId: number; expiresAt: Date }[]>`
    DELETE FROM "PasswordResetToken"
    WHERE "tokenHash" = ${hashToken(rawToken)}
    RETURNING "userId", "expiresAt"`;

  const consumed = rows[0];
  if (!consumed) return null;
  if (consumed.expiresAt <= new Date()) return null;

  return consumed.userId;
}
