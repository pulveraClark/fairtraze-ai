import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/geist";
import "../src/index.css";
import { AuthProvider } from "../src/context/AuthContext";
import { InstructorInstructionsModal } from "../src/components/InstructorInstructionsModal";
import { BriefCheckWithMarks } from "../src/components/BriefCheckWithMarks";
import { StudentMemberWindow, type StudentMemberView } from "../src/components/StudentMemberWindow";
import type { AiBriefCheck, AiReviewResponse } from "../src/lib/aiReview";

// The real instructions window, "We have this" box and member window with fixed data and a faked fetch (no backend).
// ?scene=instructions | marks-leader | marks-instructor | member-window

const scene = new URLSearchParams(location.search).get("scene") ?? "instructions";
const K = "a".repeat(32);
const BRIEF = "Build a GraphHopper route planner with a Tkinter GUI and write its system documentation. The documentation must explain how to plan and save a trip, how the GUI is organised and how the program talks to GraphHopper.";

const claim = {
  id: 1, requirementKey: K, requirementText: "Write system documentation.", role: "LEADER", status: "LEADER_CLAIM",
  note: "It is in the User Guide section of the Docs, page 3, with screenshots.", hasImage: false, imageUrl: null,
  markedBy: { id: 5, name: "Alexandria Montgomery-Castellanos" }, markedByYou: scene === "marks-leader", createdAt: "2026-10-26T10:00:00Z", updatedAt: "2026-10-26T10:00:00Z", stale: false,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
localStorage.setItem("ft_auth_token", "t");
window.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.endsWith("/api/auth/me")) {
    return json({ id: 5, email: "a@example.test", name: "Alexandria Montgomery-Castellanos", systemRole: scene === "marks-instructor" || scene === "instructions" ? "INSTRUCTOR" : "STUDENT" });
  }
  if (url.endsWith("/api/assignments/7")) return json({ assignment: { id: 7, title: "Route Finder: capstone project instructions", description: BRIEF, attachments: [] }, groups: [] });
  if (url.endsWith("/requirement-marks")) return json({ marks: scene === "marks-instructor" ? [claim] : [] });
  return json({ error: "not found" }, 404);
}) as typeof fetch;

const check = {
  generatedAt: "2026-10-26T01:00:00Z", outdated: false, nothingFound: false,
  requirements: [
    { key: K, text: "Write system documentation.", status: "NOT_FOUND", unverified: true, evidence: [], sourceQuote: "write its system documentation" },
    { key: "b".repeat(32), text: "Use a Tkinter GUI.", status: "FOUND", unverified: false, sourceQuote: "with a Tkinter GUI", evidence: [{ type: "file", ref: "Graphhopper.py", quote: "root = tk.Tk()", quoteHidden: false }] },
  ],
} as unknown as AiBriefCheck;

const view = (userId: number, name: string, over: Partial<StudentMemberView> = {}): StudentMemberView => ({
  userId, name, isLeader: userId === 1, functionalRoles: ["DEVELOPER", "DOCUMENTATION"], avatarUpdatedAt: null,
  contributionShare: 0.4, githubContributionShare: 0.5, documentContributionShare: 0.3, flags: ["free-rider", "deadline-driven"], tasks: { open: 2, done: 5 }, ...over,
});
const members = [view(1, "Alexandria Montgomery-Castellanos"), view(2, "Ben Cruz", { flags: [] }), view(3, "Ana Reyes")];
const ai: AiReviewResponse = {
  enabled: true, running: false, canGenerate: false, hasReport: true, generatedAt: "2026-10-26T01:00:00Z", basedOnReportAt: "2026-10-24T01:00:00Z", outdated: false,
  summaries: members.map((m, i) => ({
    userId: m.userId, name: m.name, githubUsername: `m${i}`, isYou: m.userId === 1, source: "ai" as const,
    summary: "Added saving of a planned trip and removed the full route details from the saved copy. Wrote the User Guide section on how to plan and save a trip.",
    evidence: { files: [{ path: "src/pages/TripsAndSavedRoutes/Graphhopper.py", added: 40, removed: 2 }], docSections: ["User Guide", "Trip Save Feature"], commitCount: 3, otherCommits: 2 },
  })),
};

function Window() {
  const [id, setId] = useState(1);
  return (
    <StudentMemberWindow
      member={members.find((m) => m.userId === id)!}
      members={members}
      currentUserId={1}
      memberCount={3}
      sourceType="COMBINED"
      noActivity={false}
      ai={ai}
      onSelect={setId}
      onClose={() => undefined}
    />
  );
}

function App() {
  if (scene === "instructions") {
    return <InstructorInstructionsModal assignmentId={7} quote="write its system documentation" editHref="/class/1/assignment/7" onClose={() => undefined} />;
  }
  if (scene === "member-window") return <Window />;
  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-6">
      <BriefCheckWithMarks
        projectId={1}
        check={check}
        instructor={scene === "marks-instructor"}
        repoUrl="https://github.com/acme/route-finder"
        sourceType="COMBINED"
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider><App /></AuthProvider>
  </QueryClientProvider>,
);
