import jwt from "jsonwebtoken";
import type { SystemRole } from "@prisma/client";

const SECRET = process.env.AUTH_SECRET;
if (!SECRET) throw new Error("AUTH_SECRET env var is required but not set");

export interface JwtPayload {
  sub: number;
  email: string;
  name: string;
  role: SystemRole;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET as string, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET as string) as unknown as JwtPayload;
}
