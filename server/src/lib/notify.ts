import type { AlertType } from "@prisma/client";
import { prisma } from "./prisma.js";

export interface NotifyInput {
  /**
   * One or more recipients, or a function that resolves them. Duplicates and
   * the actor are dropped. Prefer the function form for anything that needs a
   * lookup: it is evaluated inside notify()'s try/catch, so a failing lookup
   * can never fail the calling route.
   */
  recipientIds: number | number[] | (() => number[] | Promise<number[]>);
  /** The user who performed the action — never notified about their own action. */
  actorId?: number;
  type: AlertType;
  message: string;
  /** In-app path that is correct for the *recipient's* role. */
  link: string;
  projectId?: number | null;
  /** Reference to the thing the notification is about (used to resolve it later). */
  refType?: string;
  refId?: number;
  /**
   * If an unread notification already exists for the same recipient + type +
   * project + ref, refresh it instead of stacking another one.
   */
  collapse?: boolean;
}

/**
 * The single entry point for creating notifications. Call it AFTER the main
 * write has succeeded. It never throws: failures are logged and swallowed so a
 * notification problem can never fail the action that triggered it.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const resolved = typeof input.recipientIds === "function" ? await input.recipientIds() : input.recipientIds;
    const ids = Array.isArray(resolved) ? resolved : [resolved];
    const recipients = [...new Set(ids)].filter((id) => id !== input.actorId);

    for (const recipientId of recipients) {
      const refType = input.refType ?? null;
      const refId = input.refId ?? null;
      const projectId = input.projectId ?? null;

      if (input.collapse) {
        const existing = await prisma.alert.findFirst({
          where: { recipientId, type: input.type, projectId, refType, refId, read: false },
        });
        if (existing) {
          await prisma.alert.update({
            where: { id: existing.id },
            data: { message: input.message, link: input.link, createdAt: new Date() },
          });
          continue;
        }
      }

      await prisma.alert.create({
        data: {
          recipientId,
          type: input.type,
          message: input.message,
          link: input.link,
          projectId,
          refType,
          refId,
        },
      });
    }
  } catch (err) {
    console.error("[notify] failed to create notification:", err);
  }
}

/**
 * Remove notifications that no longer point at anything (e.g. a pending join
 * request that was cancelled). Never throws.
 */
export async function resolveNotifications(match: {
  type: AlertType;
  refType: string;
  refId: number;
}): Promise<void> {
  try {
    await prisma.alert.deleteMany({ where: match });
  } catch (err) {
    console.error("[notify] failed to resolve notifications:", err);
  }
}

/** Ids of all active admins. Returns [] (and logs) on failure. */
export async function activeAdminIds(): Promise<number[]> {
  try {
    const admins = await prisma.user.findMany({
      where: { systemRole: "ADMIN", active: true },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  } catch (err) {
    console.error("[notify] failed to load admins:", err);
    return [];
  }
}
