import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/geist";
import "../src/index.css";
import { AuthProvider } from "../src/context/AuthContext";
import { RouterProvider } from "../src/router";
import { ToastProvider } from "../src/components/Toast";
import { StudentNotesPage } from "../src/pages/StudentNotesPage";
import { DisputesPage } from "../src/pages/DisputesPage";
import { StudentNoteCard } from "../src/components/StudentNoteCard";
import type { StudentNote } from "../src/lib/notes";

// ?scene=student-notes | group-notes | instructor
// student-notes and instructor are the real pages with a faked fetch. The group page Notes list is inline in
// StudentGroupPage ("Your notes (N)" + StudentNoteCard per note), so group-notes rebuilds just that block from the
// same card component and classes.
const scene = new URLSearchParams(location.search).get("scene") ?? "student-notes";
const instructor = scene === "instructor";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const calls: string[] = [];
(window as unknown as { __calls: string[] }).__calls = calls;
localStorage.setItem("ft_auth_token", "t");

const LONG = "Most of my work happened offline: interviews, research, and the long-named-file-" + "x".repeat(60) + " that I reviewed with my teammates.";
const GROUP = "Group Alexandria-Montgomery-Castellanos-and-friends";

const notes: StudentNote[] = [
  { id: 3, projectId: 7, status: "RESOLVED", reason: LONG, instructorResponse: "Thank you for the context. I have updated my notes about your offline research.", disputedFlags: '["inactive"]', createdAt: "2026-10-05T10:00:00Z", seenAt: "2026-10-06T08:00:00Z", resolvedAt: "2026-10-06T10:00:00Z", project: { id: 7, groupName: GROUP } },
  { id: 2, projectId: 7, status: "DISMISSED", reason: "Please check the Docs hours.", instructorResponse: "I checked, and the recorded result stands.", disputedFlags: "", createdAt: "2026-10-04T10:00:00Z", seenAt: null, resolvedAt: "2026-10-04T12:00:00Z", project: { id: 7, groupName: GROUP } },
  { id: 4, projectId: 7, status: "OPEN", reason: LONG, instructorResponse: null, disputedFlags: '["free-rider"]', createdAt: "2026-10-18T10:00:00Z", seenAt: "2026-10-19T15:45:00Z", resolvedAt: null, project: { id: 7, groupName: GROUP } },
  { id: 1, projectId: 7, status: "OPEN", reason: "A newer note nobody opened yet.", instructorResponse: null, disputedFlags: "[]", createdAt: "2026-10-20T10:00:00Z", seenAt: null, resolvedAt: null, project: { id: 7, groupName: GROUP } },
];

const dispute = {
  id: 5, memberName: "Alexandria Montgomery-Castellanos", reason: LONG, status: "OPEN", instructorResponse: null, disputedFlags: ["free-rider"],
  createdAt: "2026-10-18T10:00:00Z", seenAt: null, resolvedAt: null,
  project: { id: 7, groupName: GROUP, name: "App", assignment: { id: 1, title: "Capstone project with a long title", classSection: { id: 1, subjectCode: "CC-APPSDEV22", subjectName: "Applications Development", edpCode: "12345" } } },
};

window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push(`${init?.method ?? "GET"} ${url}`);
  if (url.endsWith("/api/auth/me")) return json({ id: 1, email: "a@example.test", name: "Alexandria Montgomery-Castellanos", systemRole: instructor ? "INSTRUCTOR" : "STUDENT", instructorStatus: "APPROVED" });
  if (url.includes("/api/disputes/mine")) return json({ disputes: notes });
  if (url.includes("/api/disputes/5/seen")) return json({ seenAt: "2026-10-21T10:00:00Z" });
  if (url.includes("/api/disputes")) return json({ disputes: [dispute], openCount: 1, total: 1, page: 1, pageSize: 20, totalPages: 1 });
  return json({ error: "not found" }, 404);
}) as typeof fetch;

function GroupNotes() {
  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-6">
      <section aria-labelledby="your-notes-heading" className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="your-notes-heading" className="text-xs font-semibold uppercase tracking-widest text-slate-700">Your notes ({notes.length})</h2>
          <button type="button" className="ft-hit rounded px-2 text-xs font-medium text-indigo-700 underline">See all your notes</button>
        </div>
        <div className="space-y-3">{notes.map((n) => <StudentNoteCard key={n.id} note={{ ...n, project: undefined }} />)}</div>
      </section>
    </main>
  );
}

function App() {
  if (scene === "group-notes") return <GroupNotes />;
  return instructor ? <DisputesPage /> : <StudentNotesPage />;
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider>
      <RouterProvider>
        <ToastProvider><App /></ToastProvider>
      </RouterProvider>
    </AuthProvider>
  </QueryClientProvider>,
);
