import { StatusPill } from "./ui/StatusPill";
import { NOTE_STATUS, noteFlags, type StudentNote } from "../lib/notes";
import { studentFlagLabels } from "../lib/studentDisplay";

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface Props {
  note: StudentNote;
  /** Shown when the card is listed outside its own group (the Your notes page). */
  groupName?: string;
  onOpenGroup?: () => void;
  highlighted?: boolean;
}

/** One filed note: what the student wrote, its status in words, and the instructor's reply if there is one. */
export function StudentNoteCard({ note, groupName, onOpenGroup, highlighted = false }: Props) {
  const status = NOTE_STATUS[note.status];
  const flags = noteFlags(note);
  return (
    <article
      id={`note-${note.id}`}
      tabIndex={-1}
      aria-label={`Note filed ${fmt(note.createdAt)}`}
      className={`rounded-xl border bg-white p-4 ${highlighted ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill kind="status" label={status.label} tone={status.tone} />
        <span className="text-xs text-slate-700">Filed {fmt(note.createdAt)}</span>
        {groupName && (
          onOpenGroup
            ? <button type="button" onClick={onOpenGroup} className="ft-hit rounded px-1 text-xs font-medium text-indigo-700 underline">{groupName}</button>
            : <span className="text-xs text-slate-700">{groupName}</span>
        )}
      </div>
      {flags.length > 0 && (
        <p className="mt-2 text-xs text-slate-700">
          About: {studentFlagLabels(flags).join(", ")}
        </p>
      )}
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-900">{note.reason}</p>
      {note.instructorResponse ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">
            Instructor reply{note.resolvedAt ? ` - ${fmt(note.resolvedAt)}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{note.instructorResponse}</p>
        </div>
      ) : note.status === "OPEN" ? (
        <p className="mt-3 text-xs text-slate-700">Your instructor has not replied yet. You will get a notification when they do.</p>
      ) : null}
    </article>
  );
}
