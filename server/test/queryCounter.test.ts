import { describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { newRequestStats, runWithRequestStats, withQueryCounter, countQuery } from "../src/lib/queryCounter.js";

describe("query counter", () => {
  it("counts Prisma operations inside a request and nothing outside it", async () => {
    const client = withQueryCounter(new PrismaClient());
    try {
      const stats = newRequestStats();
      await runWithRequestStats(stats, async () => {
        await client.user.count();
        await Promise.all([client.user.count(), client.department.count()]);
      });
      expect(stats.queries).toBe(3);

      const other = newRequestStats();
      await client.user.count(); // no request: not counted anywhere
      expect(other.queries).toBe(0);
    } finally {
      await client.$disconnect();
    }
  });

  it("keeps two overlapping requests apart", async () => {
    const a = newRequestStats();
    const b = newRequestStats();
    await Promise.all([
      runWithRequestStats(a, async () => { await Promise.resolve(); countQuery(); }),
      runWithRequestStats(b, async () => { countQuery(); await Promise.resolve(); countQuery(); countQuery(); }),
    ]);
    expect([a.queries, b.queries]).toEqual([1, 3]);
  });
});
