import { prisma } from "./prisma.js";

/** A refresh runs about every 15 minutes while a tab is open; write at most once an hour. */
export const LAST_LOGIN_REFRESH_THROTTLE_MS = 60 * 60 * 1000;

/** Sign-in: always record it. */
export async function recordSignIn(userId: number, now: Date = new Date()): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: now } });
}

/** Session refresh: record it only when unset or older than the throttle, so it is not a write per refresh. */
export async function recordSessionRefresh(userId: number, now: Date = new Date()): Promise<void> {
  await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: new Date(now.getTime() - LAST_LOGIN_REFRESH_THROTTLE_MS) } }],
    },
    data: { lastLoginAt: now },
  });
}
