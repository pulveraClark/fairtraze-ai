import { prisma } from "./prisma.js";

/**
 * Finds a user by email without caring about letter case, so "Ann@School.edu" still reaches an
 * account saved that way and one saved as "ann@school.edu". An exact match always wins (cheap, uses
 * the unique index); only when there is none do we fall back to a case-insensitive search, which
 * keeps old mixed-case accounts working without rewriting any stored email.
 */
export async function findUserByEmail(email: string) {
  const exact = await prisma.user.findUnique({ where: { email } });
  if (exact) return exact;
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    orderBy: { id: "asc" },
  });
}
