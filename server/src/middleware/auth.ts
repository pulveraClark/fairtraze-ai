import type { Request, Response, NextFunction } from "express";
import type { SystemRole } from "@prisma/client";
import { verifyToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

export function authenticateToken(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token  = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      // Invalid or expired token — leave req.user undefined; the route decides
    }
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  authenticateToken(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    next();
  });
}

export const INSTRUCTOR_PENDING_MESSAGE  = "Your instructor account is waiting for admin approval.";
export const INSTRUCTOR_REJECTED_MESSAGE = "Your instructor request was not approved. Contact your administrator.";

// Instructors are gated on admin approval. Status is read from the DB (not the JWT) so an
// approval or rejection takes effect on the very next request, without waiting for the
// 15-minute token refresh. Selects only the two fields it needs.
export function requireRole(...roles: SystemRole[]) {
  return [
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user || !roles.includes(req.user.role)) {
          res.status(403).json({ error: "Insufficient permissions" });
          return;
        }

        if (req.user.role === "INSTRUCTOR") {
          const row = await prisma.user.findUnique({
            where:  { id: req.user.sub },
            select: { instructorStatus: true, active: true },
          });
          if (!row || !row.active) {
            res.status(403).json({ error: "Insufficient permissions" });
            return;
          }
          if (row.instructorStatus === "PENDING") {
            res.status(403).json({ error: INSTRUCTOR_PENDING_MESSAGE, code: "INSTRUCTOR_PENDING" });
            return;
          }
          if (row.instructorStatus === "REJECTED") {
            res.status(403).json({ error: INSTRUCTOR_REJECTED_MESSAGE, code: "INSTRUCTOR_REJECTED" });
            return;
          }
        }

        next();
      } catch (err) {
        next(err);
      }
    },
  ];
}

// Read live (not cached at import time) so REQUIRE_EMAIL_VERIFICATION can be
// flipped per-test via process.env without needing vi.resetModules().
// Defaults to enforced: only the literal string "false" disables the gate.
export function isEmailVerificationRequired(): boolean {
  return process.env.REQUIRE_EMAIL_VERIFICATION !== "false";
}

// Soft gate for the small set of state-changing routes (group creation/join,
// triggering analysis) that require a verified email. Reads live from the DB
// rather than the JWT so a just-verified user is unblocked immediately,
// without waiting for the 15-minute access-token refresh cycle. Must run
// after requireAuth/requireRole so req.user is populated.
export async function requireVerifiedEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!isEmailVerificationRequired()) {
    next();
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { emailVerified: true } });
  if (!user?.emailVerified) {
    res.status(403).json({ error: "Please verify your email before doing this.", code: "EMAIL_NOT_VERIFIED" });
    return;
  }

  next();
}
