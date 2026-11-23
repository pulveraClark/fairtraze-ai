import { PrismaClient } from "@prisma/client";
import { withQueryCounter } from "./queryCounter.js";
import { isTimingEnabled } from "../middleware/requestTiming.js";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// When the request timing log is on, every operation is counted per request (see queryCounter.ts). The wrapped
// client is typed as a plain PrismaClient; if the wrapping ever causes trouble, set REQUEST_TIMING_LOG=off.
function createClient(): PrismaClient {
  const base = new PrismaClient({ log: ["error"] });
  return isTimingEnabled() ? withQueryCounter(base) : base;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
