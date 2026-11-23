import { z } from "zod";
import type { Prisma } from "@prisma/client";

const roleEnum = z.enum(["ADMIN", "INSTRUCTOR", "STUDENT"]);
const DAY_MS = 24 * 60 * 60 * 1000;

export const USER_SORTS = ["name", "joined", "lastActive"] as const;
export type UserSort = (typeof USER_SORTS)[number];

export interface AdminUsersFilters {
  search: string;
  role?: z.infer<typeof roleEnum>;
  status?: "active" | "inactive";
  lastActive?: "7d" | "30d" | "never";
  includeFormer: boolean;
  sort: UserSort;
  dir: "asc" | "desc";
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Reads the list/export query string. Unknown values are ignored, never passed to Prisma. */
export function parseAdminUsersFilters(query: Record<string, unknown>): AdminUsersFilters {
  const role = roleEnum.safeParse(str(query.role));
  const status = str(query.status);
  const lastActive = str(query.lastActive);
  const sort = str(query.sort);
  const sortValid = (USER_SORTS as readonly string[]).includes(sort);
  return {
    search: str(query.search).trim(),
    role: role.success ? role.data : undefined,
    status: status === "active" || status === "inactive" ? status : undefined,
    lastActive: lastActive === "7d" || lastActive === "30d" || lastActive === "never" ? lastActive : undefined,
    includeFormer: query.includeFormer === "true",
    sort: sortValid ? (sort as UserSort) : "joined",
    // Joined and last active read best newest first; names A to Z.
    dir: query.dir === "asc" || query.dir === "desc" ? query.dir : sort === "name" ? "asc" : "desc",
  };
}

/** Filters without the former-member rule, so the "Show former members (n)" count can use them. */
export function buildUserFilters(f: AdminUsersFilters, now: Date = new Date()): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];
  if (f.role) and.push({ systemRole: f.role });
  if (f.status) and.push({ active: f.status === "active" });
  if (f.lastActive === "never") and.push({ lastLoginAt: null });
  if (f.lastActive === "7d" || f.lastActive === "30d") {
    const days = f.lastActive === "7d" ? 7 : 30;
    and.push({ lastLoginAt: { gte: new Date(now.getTime() - days * DAY_MS) } });
  }
  if (f.search) {
    and.push({
      OR: [
        { name: { contains: f.search, mode: "insensitive" } },
        { email: { contains: f.search, mode: "insensitive" } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export function buildUserOrderBy(f: AdminUsersFilters): Prisma.UserOrderByWithRelationInput[] {
  const tie: Prisma.UserOrderByWithRelationInput = { id: f.dir };
  if (f.sort === "name") return [{ name: f.dir }, tie];
  if (f.sort === "lastActive") return [{ lastLoginAt: { sort: f.dir, nulls: "last" } }, tie];
  return [{ createdAt: f.dir }, tie];
}
