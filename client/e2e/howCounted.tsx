import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/geist";
import "../src/index.css";
import type { CombinedScoredMember, DocumentScoredMember, ScoredMember } from "@shared/types";
import { AuthProvider } from "../src/context/AuthContext";
import { MemberDrawer } from "../src/components/report/MemberDrawer";
import { StudentMemberWindow, type StudentMemberView } from "../src/components/StudentMemberWindow";
import { ownCountedInput, type CombinedMyContribution } from "../src/lib/contributionStats";

// ?scene=instructor | student. The real windows with fixed data; "How this was counted" has non-zero numbers.
const scene = new URLSearchParams(location.search).get("scene") ?? "instructor";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
localStorage.setItem("ft_auth_token", "t");
window.fetch = (async (input: RequestInfo | URL) => {
  if (String(input).endsWith("/api/auth/me")) return json({ id: 1, email: "a@example.test", name: "Alexandria Montgomery-Castellanos", systemRole: "STUDENT" });
  return json({ error: "not found" }, 404);
}) as typeof fetch;

const github: ScoredMember = {
  studentName: "Alexandria Montgomery-Castellanos", githubUsername: "alex", commits: 42, additions: 5200, deletions: 900, churn: 6100, activeDays: 12,
  lastPhaseRatio: 0.7, commitShare: 0.3, linesShare: 0.3, activeDaysShare: 0.3, contributionShare: 0.4,
  codeLinesAdded: 4800, commentLinesAdded: 300, blankLinesAdded: 100, codeToCommentRatio: 16, weightedAdditions: 4300, selfChurnRatio: 0.12,
  commitImpactBreakdown: { structural: 4, functional: 30, cosmetic: 6, trivial: 2 },
  fileTypeBreakdown: { source: 3000, test: 800, docs: 400, style: 500, config: 400, other: 100 },
  flags: [],
};
const docs: DocumentScoredMember = {
  studentName: "x", userId: 1, githubUsername: "", sessionCount: 9, totalInsertedChars: 12000, totalDeletedChars: 2000,
  retainedChars: 9000, effectiveRetainedChars: 8800, churn: 14000, activeDays: 6, lastPhaseRatio: 0.4,
  sessionShare: 0.3, retainedTextShare: 0.3, activeDaysShare: 0.3, contributionShare: 0.3, selfChurnRatio: 0.05,
  weightedRetainedChars: 8000, editTypeBreakdown: { substantive: 30, revision: 10, formatting: 4, trivial: 2 },
  flags: [], importedRetainedChars: 1500, importNote: "est", insertedImageCount: 2,
};
const member: CombinedScoredMember = {
  studentName: "Alexandria Montgomery-Castellanos", userId: 1, githubUsername: "alex", githubContributionShare: 0.45, documentContributionShare: 0.3,
  wGitHub: 0.5, wDocs: 0.5, contributionShare: 0.375, lastPhaseRatio: 0.55, flags: ["deadline-driven"], github, document: docs,
};

const mine: CombinedMyContribution = {
  contributionShare: 0.375, githubContributionShare: 0.45, documentContributionShare: 0.3, wGitHub: 0.5, wDocs: 0.5, flags: ["deadline-driven"],
  github: { commits: 42, additions: 5200, deletions: 900, activeDays: 12, commentLinesAdded: 300, blankLinesAdded: 100 },
  document: { sessionCount: 9, activeDays: 6, retainedChars: 9000, totalInsertedChars: 12000, selfChurnRatio: 0.05, importedRetainedChars: 1500, insertedImageCount: 2 },
};
const view: StudentMemberView = {
  userId: 1, name: "Alexandria Montgomery-Castellanos", isLeader: false, functionalRoles: ["DEVELOPER", "DOCUMENTATION"], avatarUpdatedAt: null,
  contributionShare: 0.375, githubContributionShare: 0.45, documentContributionShare: 0.3, flags: ["deadline-driven"], tasks: null,
};

function App() {
  if (scene === "student") {
    return (
      <StudentMemberWindow
        member={view} members={[view]} currentUserId={1} memberCount={3} sourceType="COMBINED" noActivity={false}
        counted={ownCountedInput(mine, "COMBINED", 2)} ai={null} onSelect={() => undefined} onClose={() => undefined}
      />
    );
  }
  return (
    <MemberDrawer
      member={member} onClose={() => undefined} source="combined" rulesVersion={2}
      thresholds={{ freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 }} deadlineBasis="assignment-deadline" memberCount={3}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider><App /></AuthProvider>
  </QueryClientProvider>,
);
