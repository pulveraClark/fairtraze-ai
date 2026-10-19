import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { CorsOptions } from "cors";
import type { Request, RequestHandler } from "express";
import { verifyToken } from "../lib/jwt.js";

const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const corsOptions: CorsOptions = {
  origin: allowedOrigins,
  credentials: true,
};

// JSON API only — no HTML is served, so a CSP is meaningless here and would
// only risk breaking clients. CORP is relaxed so the cross-origin Vite
// frontend can fetch API responses.
export const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

const rateLimitDefaults = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
};

/**
 * Number of reverse proxies in front of the server (Render = 1). Express only trusts X-Forwarded-For
 * when told to; without it req.ip is the proxy's address, so every IP-keyed limiter would put the whole
 * school in one bucket. Default 0 (local dev: no proxy). Set TRUST_PROXY_HOPS=1 on Render.
 */
export function trustProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.TRUST_PROXY_HOPS ?? 0);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0;
}

function clientIp(req: Request): string {
  return ipKeyGenerator(req.ip ?? "");
}

/** The email in a login/forgot-password body, normalised the same way for every limiter. */
function submittedEmail(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email.trim().toLowerCase().slice(0, 254) : "";
}

// ── Sign-in limits ────────────────────────────────────────────────────────────
// Brute force on one account is also stopped by the per-account lockout (6 wrong passwords, routes/auth.ts),
// so these exist to cap noise and credential stuffing, not to be the only defence. They were one shared
// 10-per-15-minutes counter per IP for login, register and forgot-password, which locked out a whole class
// on one Wi-Fi.

/** 10 failed sign-ins per 15 min for the same email from the same IP. Successful sign-ins do not count. */
const loginPerAccountLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${clientIp(req)}|${submittedEmail(req)}`,
});

/** Backstop against guessing across many emails: 100 failed sign-ins per 15 min per IP. */
const loginIpBackstopLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 15 * 60 * 1000,
  max: 100,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login-ip:${clientIp(req)}`,
});

/** 30 sign-ups per hour per IP (a lab registering together still fits). */
const registerLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => `register:${clientIp(req)}`,
});

/** 5 reset requests per hour for the same email from the same IP (the route always answers 200, so all count). */
const forgotPasswordLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `forgot:${clientIp(req)}|${submittedEmail(req)}`,
});

function runInOrder(handlers: RequestHandler[]): RequestHandler {
  return (req, res, next) => {
    let i = 0;
    const step = (err?: unknown): void => {
      if (err) return next(err);
      const h = handlers[i++];
      if (!h) return next();
      h(req, res, step);
    };
    step();
  };
}
const loginLimiters = runInOrder([loginIpBackstopLimiter, loginPerAccountLimiter]);

/**
 * Mounted once for /api/auth/login, /register and /forgot-password (app.ts); picks the limits for the
 * route that was called. One export so a test can replace it with a pass-through.
 */
export const authLimiter: RequestHandler = (req, res, next) => {
  const path = req.originalUrl.split("?")[0];
  if (path.endsWith("/register")) return registerLimiter(req, res, next);
  if (path.endsWith("/forgot-password")) return forgotPasswordLimiter(req, res, next);
  return loginLimiters(req, res, next);
};

// Keyed by instructor id (not IP) so bulk-analyze runs get their own quota and
// instructors sharing an institutional NAT/IP don't share one bucket. Requires
// authenticateToken to have already run for this request (see app.ts) so
// req.user is populated; falls back to IP only for the rare unauthenticated
// case, where the route itself will 401 regardless.
export const analysisLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 15 * 60 * 1000,
  max: 80,
  keyGenerator: (req) => (req.user ? `user:${req.user.sub}` : ipKeyGenerator(req.ip ?? "")),
});

// Personal-data export (RA 10173 access/portability): a heavy, many-table read, so 5 per hour
// per user. Needs authenticateToken to have run first (see app.ts) to key by user id.
export const exportLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => (req.user ? `user:${req.user.sub}` : ipKeyGenerator(req.ip ?? "")),
});

// Burst limit for task creation: 30 per minute per user.
// Keyed by user id, so it needs authenticateToken to have run first (see app.ts).
export const taskWriteLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "You're adding things too quickly. Please wait a minute and try again." },
  keyGenerator: (req) => (req.user ? `user:${req.user.sub}` : ipKeyGenerator(req.ip ?? "")),
});

// Task comments (and the @mentions inside them): 30 per minute per user, its own bucket so a burst of
// comments never eats the task-creation allowance. Needs authenticateToken first (see app.ts).
export const taskCommentLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "You're commenting too quickly. Please wait a minute and try again." },
  keyGenerator: (req) => (req.user ? `user:${req.user.sub}` : ipKeyGenerator(req.ip ?? "")),
});

/**
 * Per signed-in user (the token is read here because this runs before authenticateToken), per IP for
 * everyone else. 1000 per 15 min: every open Tasks tab polls every 10 s (~90 requests per 15 min per
 * tab), so a class on one Wi-Fi would have exhausted a per-IP 300.
 */
export function globalLimiterKey(req: Request): string {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      return `user:${verifyToken(header.slice(7)).sub}`;
    } catch {
      // expired or invalid token: counted against the IP like an anonymous request
    }
  }
  return clientIp(req);
}

export const globalLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 15 * 60 * 1000,
  max: 1000,
  keyGenerator: globalLimiterKey,
});
