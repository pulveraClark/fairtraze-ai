import type { Request, Response, NextFunction } from "express";
import type { SystemRole } from "@prisma/client";
import { verifyToken } from "../lib/jwt.js";

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

export function requireRole(...roles: SystemRole[]) {
  return [
    requireAuth,
    (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user || !roles.includes(req.user.role)) {
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }
      next();
    },
  ];
}
