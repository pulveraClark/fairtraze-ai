import type { SystemRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: number;
        email: string;
        name: string;
        role: SystemRole;
      };
    }
  }
}

export {};
