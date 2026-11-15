import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@prisma/client";

// Per-request counters for the timing log. Numbers and one label only: no user data, ids or SQL.
export interface RequestStats {
  /** Prisma operations (one findMany with an include counts once, not once per SQL statement). */
  queries: number;
  /** Extra numbers a route wants on its own timing line, e.g. { bcrypt: 212 } prints "bcrypt=212ms". */
  extraMs: Record<string, number>;
}

const store = new AsyncLocalStorage<RequestStats>();

export function runWithRequestStats<T>(stats: RequestStats, fn: () => T): T {
  return store.run(stats, fn);
}

export function newRequestStats(): RequestStats {
  return { queries: 0, extraMs: {} };
}

/** Called by the Prisma extension. A no-op outside a request. */
export function countQuery(): void {
  const s = store.getStore();
  if (s) s.queries += 1;
}

/** A route adds a duration (ms) to its own timing line. A no-op outside a request or when timing is off. */
export function addTimingMs(name: string, ms: number): void {
  const s = store.getStore();
  if (s) s.extraMs[name] = Math.round(ms);
}

/**
 * Wraps a PrismaClient so every operation is counted for the current request.
 * Kept separate from prisma.ts so it can be tested against the plain client.
 */
export function withQueryCounter(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      $allOperations({ args, query }) {
        countQuery();
        return query(args);
      },
    },
  }) as unknown as PrismaClient;
}
