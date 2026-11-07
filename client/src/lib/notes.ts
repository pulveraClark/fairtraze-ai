import type { PillTone } from "../components/ui/StatusPill";

/** A student's own filed note ("Add a note"), as returned by GET /api/disputes/mine. */
export interface StudentNote {
  id:                 number;
  projectId:          number;
  status:             "OPEN" | "RESOLVED" | "DISMISSED";
  reason:             string;
  instructorResponse: string | null;
  disputedFlags:      string; // JSON array captured at submission; "" = filed before flags were recorded
  createdAt:          string;
  /** When the owning instructor first opened it. Null/absent until then (and on notes from before this existed). */
  seenAt?:            string | null;
  resolvedAt:         string | null;
  project?:           { id: number; groupName: string };
}

/** Where a note is, in the student's words: Sent -> Seen -> Answered. */
export type NoteStage = "sent" | "seen" | "answered";

export const NOTE_STAGE: Record<NoteStage, { label: string; tone: PillTone }> = {
  sent:     { label: "Sent",     tone: "neutral" },
  seen:     { label: "Seen",     tone: "sky" },
  answered: { label: "Answered", tone: "green" },
};

/** Answered once the instructor has replied (any status but OPEN); Seen once they opened it. */
export function noteStage(note: Pick<StudentNote, "status" | "seenAt">): NoteStage {
  if (note.status !== "OPEN") return "answered";
  return note.seenAt ? "seen" : "sent";
}

/** "Oct 20, 2026" on the school's calendar day (Asia/Manila), like tasks and the analysis days: a late-evening
 *  time never shows the next or previous day because of the browser's own time zone. Date only, no time. */
export function formatNoteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
}

/** Plain words for the instructor's decision, shown in the reply header. */
export function noteOutcomeText(status: StudentNote["status"]): string {
  if (status === "RESOLVED") return "Your instructor accepted your note";
  if (status === "DISMISSED") return "Your instructor kept the result";
  return "Instructor reply";
}

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
