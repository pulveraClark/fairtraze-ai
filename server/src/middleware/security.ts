import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { CorsOptions } from "cors";

const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const corsOptions: CorsOptions = {
  origin: allowedOrigins,
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

export const analysisLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 15 * 60 * 1000,
  max: 20,
});

export const globalLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 15 * 60 * 1000,
  max: 300,
});
