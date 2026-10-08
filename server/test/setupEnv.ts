import { afterAll, afterEach, vi } from "vitest";

// Never hit Gemini, GitHub, or Resend from a test run — these are external
// services with cost/flakiness/non-determinism, unlike the real Postgres
// test branch which we do want to exercise for real.
vi.mock("../src/lib/gemini.js", () => ({
  generateFairnessNarrative: vi.fn().mockResolvedValue("Mocked fairness narrative for testing."),
}));

vi.mock("../src/lib/github.js", () => ({
  fetchRepoStats: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/lib/email.js", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

afterEach(async () => {
  if (!process.env.DATABASE_URL) return;
  const { prisma } = await import("../src/lib/prisma.js");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const names = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const { prisma } = await import("../src/lib/prisma.js");
  await prisma.$disconnect();
});
