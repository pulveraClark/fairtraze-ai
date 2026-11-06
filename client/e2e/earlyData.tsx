import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/geist";
import "../src/index.css";
import type { AnyScoredMember, ScoredMember } from "@shared/types";
import type { DataConfidence } from "@shared/dataConfidence";
import { AuthProvider } from "../src/context/AuthContext";
import { StatTile, StatusPill } from "../src/components/ui";
import { EarlyDataTag } from "../src/components/EarlyDataTag";
import { FlagTag } from "../src/components/FlagTag";
import { MemberContributionList } from "../src/components/report/MemberContributionList";
import { MemberDrawer } from "../src/components/report/MemberDrawer";
import { Narrative } from "../src/components/Narrative";
import { StudentMemberWindow, type StudentMemberView } from "../src/components/StudentMemberWindow";
import { studentHealthLabel, evennessLine, earlyDataFlagsNote } from "../src/lib/studentDisplay";
import { aiFooterLine } from "../src/lib/aiFooter";

// ?scene=instructor|student|student-window|member-drawer|footer  &level=low|medium
// The real tag, tile, member list, member window/drawer and AI footer with fixed data and a faked fetch (no backend).
// The student "Team overview" and "Your Flags" blocks are inline in StudentGroupPage, so they are rebuilt here from the
// same components and classes (the replica is marked in the scene).
const q = new URLSearchParams(location.search);
const scene = q.get("scene") ?? "instructor";
const level = (q.get("level") ?? "low") as DataConfidence;
const muted = level === "low";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
localStorage.setItem("ft_auth_token", "t");
window.fetch = (async (input: RequestInfo | URL) => {
  if (String(input).endsWith("/api/auth/me")) return json({ id: 1, email: "a@example.test", name: "Alexandria Montgomery-Castellanos", systemRole: scene === "student" || scene === "student-window" ? "STUDENT" : "INSTRUCTOR" });
  return json({ error: "not found" }, 404);
}) as typeof fetch;

const base: ScoredMember = {
  studentName: "Alexandria Montgomery-Castellanos", githubUsername: "alex", commits: 4, additions: 120, deletions: 10, churn: 130, activeDays: 3,
  lastPhaseRatio: 0.7, commitShare: 0.3, linesShare: 0.3, activeDaysShare: 0.3, contributionShare: 0.7,
  codeLinesAdded: 100, commentLinesAdded: 10, blankLinesAdded: 10, codeToCommentRatio: 10, weightedAdditions: 100, selfChurnRatio: 0.1,
  commitImpactBreakdown: { structural: 0, functional: 4, cosmetic: 0, trivial: 0 },
  fileTypeBreakdown: { source: 100, test: 0, docs: 0, style: 0, config: 0, other: 0 }, flags: ["overload", "deadline-driven"],
};
const members: AnyScoredMember[] = [
  base,
  { ...base, studentName: "Ben Cruz", githubUsername: "ben", contributionShare: 0.3, flags: ["free-rider"] },
];

const view: StudentMemberView = {
  userId: 1, name: "Alexandria Montgomery-Castellanos", isLeader: false, functionalRoles: ["DEVELOPER"], avatarUpdatedAt: null,
  contributionShare: 0.3, githubContributionShare: null, documentContributionShare: null, flags: ["free-rider", "deadline-driven"], tasks: null,
};

function Instructor() {
  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl space-y-4 px-4 py-6">
      <StatTile
        hero
        label="Team health"
        tone={muted ? "neutral" : "red"}
        value={(
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusPill kind="health" value="High Risk" className="!text-lg" muted={muted} />
            <EarlyDataTag level={level} />
          </span>
        )}
        detail="Gini 0.400"
      />
      <MemberContributionList members={members} mutedFlags={muted} onOpen={() => undefined} />
    </main>
  );
}

function Student() {
  const note = earlyDataFlagsNote(level);
  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl space-y-4 px-4 py-6">
      {/* Replica of the Team overview and Your Flags blocks in StudentGroupPage (same components and classes). */}
      <section aria-labelledby="t" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h3 id="t" className="text-sm font-semibold text-slate-900">Team overview</h3>
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs text-slate-700">How evenly work is shared</p>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${muted ? "text-slate-800 bg-slate-100 border-slate-300" : "text-red-700 bg-red-50 border-red-200"}`}>
              {studentHealthLabel("High Risk")}
            </span>
            <EarlyDataTag level={level} />
          </span>
          <p className="mt-1.5 text-sm leading-normal text-slate-900">{evennessLine("High Risk")}</p>
        </div>
      </section>
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Your Flags</h3>
        {note && <p className="-mt-2 mb-3 text-xs leading-normal text-slate-700">{note}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <FlagTag flag="free-rider" view="own" muted={muted} />
          <FlagTag flag="deadline-driven" view="own" muted={muted} />
        </div>
      </div>
      <p className="mt-4 text-xs leading-normal text-slate-700">{aiFooterLine()}</p>
    </main>
  );
}

function App() {
  if (scene === "student") return <Student />;
  if (scene === "student-window") {
    return (
      <StudentMemberWindow member={view} members={[view]} currentUserId={1} memberCount={2} sourceType="GITHUB" noActivity={false}
        flagsMuted={muted} ai={null} onSelect={() => undefined} onClose={() => undefined} />
    );
  }
  if (scene === "member-drawer") {
    return (
      <MemberDrawer member={members[1]} onClose={() => undefined} source="github" rulesVersion={2}
        flagsMuted={muted} flagsMayChange={level === "medium"}
        thresholds={{ freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 }} deadlineBasis="assignment-deadline" memberCount={2} />
    );
  }
  if (scene === "footer") {
    return (
      <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-6">
        <Narrative narrative="The team shares the work fairly evenly." projectId={1} onNarrativeGenerated={() => undefined} basedOnAt="2026-10-24T01:00:00Z" />
      </main>
    );
  }
  return <Instructor />;
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider><App /></AuthProvider>
  </QueryClientProvider>,
);
