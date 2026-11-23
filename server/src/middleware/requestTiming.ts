import type { Request, Response, NextFunction } from "express";
import { newRequestStats, runWithRequestStats } from "../lib/queryCounter.js";

// One log line per request: method, route PATTERN (":id", never the real id), status, duration and the number of
// Prisma operations. Never logs the URL, query string, headers, body, cookies, tokens, user id or IP.
//
// Switches (names only):
//   REQUEST_TIMING_LOG=off      turn the log off (default on; under NODE_ENV=test it is off unless set to "on")
//   REQUEST_TIMING_MIN_MS=NNN   hide requests faster than this (default 0 = log everything)

export const SLOW_REQUEST_MS = 2000;

export function isTimingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.REQUEST_TIMING_LOG?.trim().toLowerCase();
  if (v === "off" || v === "false" || v === "0") return false;
  if (v === "on" || v === "true" || v === "1") return true;
  return env.NODE_ENV !== "test";
}

function minMs(env: NodeJS.ProcessEnv): number {
  const n = Number(env.REQUEST_TIMING_MIN_MS);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The matched route pattern, or "(no route)". Uses only the route definition, never the request URL. */
export function routePattern(req: Request): string {
  const path = req.route?.path;
  if (typeof path !== "string") return "(no route)";
  return `${req.baseUrl ?? ""}${path}`;
}

export function formatTimingLine(opts: {
  method: string;
  pattern: string;
  status: number;
  ms: number;
  queries: number | null;
  extraMs: Record<string, number>;
}): string {
  const slow = opts.ms > SLOW_REQUEST_MS ? "[slow]" : "";
  const q = opts.queries === null ? "-" : String(opts.queries);
  const extra = Object.entries(opts.extraMs).map(([k, v]) => ` ${k}=${v}ms`).join("");
  return `[timing]${slow} ${opts.method} ${opts.pattern} ${opts.status} ${Math.round(opts.ms)}ms q=${q}${extra}`;
}

export interface RequestTimingOptions {
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  /** False when the Prisma client was not wrapped with the counter: prints q=- instead of a wrong zero. */
  countsQueries?: boolean;
}

export function requestTiming(options: RequestTimingOptions = {}) {
  const env = options.env ?? process.env;
  if (!isTimingEnabled(env)) return (_req: Request, _res: Response, next: NextFunction) => next();
  const log = options.log ?? ((line: string) => console.log(line));
  const threshold = minMs(env);
  const countsQueries = options.countsQueries ?? true;

  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    const stats = newRequestStats();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      if (ms < threshold) return;
      log(formatTimingLine({
        method: req.method,
        pattern: routePattern(req),
        status: res.statusCode,
        ms,
        queries: countsQueries ? stats.queries : null,
        extraMs: stats.extraMs,
      }));
    });
    runWithRequestStats(stats, () => next());
  };
}
