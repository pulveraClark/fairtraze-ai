import { useEffect, useMemo } from "react";
import { AppFooter } from "../components/AppFooter";
import { useMyDisputesQuery } from "../hooks/useGroupQueries";
import { useRouter } from "../router";
import { PageHeader } from "../components/ui/PageHeader";
import { StudentNoteCard } from "../components/StudentNoteCard";
import { sortNotes, type StudentNote } from "../lib/notes";

/** A student's own filed notes across all their groups, with status and the instructor's reply. Read-only. */
export function StudentNotesPage() {
  const { navigate } = useRouter();
  const query = useMyDisputesQuery<StudentNote>();
  const notes = useMemo(() => sortNotes(query.data ?? []), [query.data]);
  const highlightId = useMemo(() => {
    const n = Number(new URLSearchParams(window.location.search).get("note"));
    return Number.isInteger(n) && n > 0 ? n : null;
  }, []);

  useEffect(() => {
    if (highlightId === null || notes.length === 0) return;
    const el = document.getElementById(`note-${highlightId}`);
    el?.scrollIntoView?.({ block: "center" });
    el?.focus({ preventScroll: true });
  }, [highlightId, notes.length]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 pb-4 pt-2 sm:px-8">
          <PageHeader
            breadcrumbs={[{ label: "Dashboard", href: "/student" }, { label: "Your notes" }]}
            title="Your notes"
            meta="Notes you sent your instructor about your contribution, and their replies."
          />
        </div>
      </div>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-8">
        {query.isPending && <p className="text-sm text-slate-700">Loading your notes…</p>}
        {query.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            Could not load your notes.{" "}
            <button type="button" onClick={() => void query.refetch()} className="font-semibold underline">Try again</button>
          </div>
        )}
        {query.isSuccess && notes.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-800">
            You have not sent a note. If a flag on your report needs context, use "Flag for review / Add a note" on that report.
          </div>
        )}
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id}>
              <StudentNoteCard
                note={n}
                groupName={n.project?.groupName}
                onOpenGroup={() => navigate(`/student/group/${n.projectId}`)}
                highlighted={n.id === highlightId}
              />
            </li>
          ))}
        </ul>
      </main>
      <AppFooter />
    </div>
  );
}
