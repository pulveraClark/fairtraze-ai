import type { PillTone } from "../components/ui/StatusPill";

/** A student's own filed note ("Flag for review"), as returned by GET /api/disputes/mine. */
export interface StudentNote {
  id:                 number;
  projectId:          number;
  status:             "OPEN" | "RESOLVED" | "DISMISSED";
  reason:             string;
  instructorResponse: string | null;
  disputedFlags:      string; // JSON array captured at submission; "" = filed before flags were recorded
  createdAt:          string;
  resolvedAt:         string | null;
  project?:           { id: number; groupName: string };
}

export const NOTE_STATUS: Record<StudentNote["status"], { label: string; tone: PillTone }> = {
  OPEN:      { label: "Open - awaiting review", tone: "amber" },
  RESOLVED:  { label: "Reviewed - accepted",    tone: "green" },
  DISMISSED: { label: "Reviewed - upheld",      tone: "neutral" },
};

export function noteFlags(note: Pick<StudentNote, "disputedFlags">): string[] {
  try {
    const parsed: unknown = note.disputedFlags ? JSON.parse(note.disputedFlags) : [];
    return Array.isArray(parsed) ? parsed.filter((f): f is string => typeof f === "string") : [];
  } catch {
    return [];
  }
}

/** Newest first, so the latest note and its reply are always on top. */
export function sortNotes<T extends Pick<StudentNote, "createdAt">>(notes: T[]): T[] {
  return [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
