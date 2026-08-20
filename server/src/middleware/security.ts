import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { CorsOptions } from "cors";

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

export const authLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 15 * 60 * 1000,
  max: 10,
});

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

export const globalLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 15 * 60 * 1000,
  max: 300,
});
