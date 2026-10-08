import type { IncomingMessage } from "http";
import { verifyToken } from "../lib/jwt.js";
import { loadGroup } from "../routes/groups.js";

export interface CollabAuthOk {
  ok: true;
  room: string;
  groupId: number;
  userId: number;
}

export interface CollabAuthFail {
  ok: false;
  // 0 means "this request's path doesn't belong to this route at all" — the caller must
  // silently return and let another `upgrade` listener (or Node's default handling) deal
  // with it, rather than writing a response and destroying the socket. The HTTP server has
  // more than one `upgrade` listener registered (the Yjs sync route and the authorship
  // broadcast route below), and Node invokes every listener for every upgrade request.
  status: 0 | 400 | 401 | 403 | 404;
}

export type CollabAuthResult = CollabAuthOk | CollabAuthFail;

const STATUS_TEXT: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
};

export function statusLine(status: number): string {
  return `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? "Error"}\r\n\r\n`;
}

// Shared JWT + group-membership check for the collab WebSocket routes (the Yjs sync server and
// the authorship-broadcast server both gate access the same way: a valid `?token=` JWT for a
// member or the class instructor of the room's group). `roomPattern` must have two capture
// groups: the full room name, then the numeric group id, e.g. /^\/collab\/(group-doc-(\d+))$/.
export async function resolveCollabAuth(
  req: IncomingMessage,
  roomPattern: RegExp
): Promise<CollabAuthResult> {
  const url = new URL(req.url ?? "", "http://internal");
  const match = roomPattern.exec(url.pathname);
  if (!match) {
    return { ok: false, status: 0 };
  }

  const token = url.searchParams.get("token");
  if (!token) {
    return { ok: false, status: 400 };
  }

  const room = match[1]!;
  const groupId = Number(match[2]);

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return { ok: false, status: 401 };
  }

  const project = await loadGroup(groupId);
  if (!project) {
    return { ok: false, status: 404 };
  }

  const isMember = project.groupMemberships.some((m) => m.userId === payload.sub);
  const isInstructor =
    (payload.role === "INSTRUCTOR" || payload.role === "ADMIN") &&
    project.assignment?.classSection.instructorId === payload.sub;

  if (!isMember && !isInstructor) {
    return { ok: false, status: 403 };
  }

  return { ok: true, room, groupId, userId: payload.sub };
}
