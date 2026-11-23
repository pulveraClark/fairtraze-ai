import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/geist";
import "../src/index.css";
import type { ProjectSummaryItem } from "@shared/types";
import { AuthProvider } from "../src/context/AuthContext";
import { RouterProvider } from "../src/router";
import { GroupSummaryCard } from "../src/components/GroupSummaryCard";
import { ProjectCard } from "../src/pages/StudentClassPage";
import { ClassCard } from "../src/pages/StudentPage";

// ?scene=instructor-card | student-class | student-dashboard
// The real GroupSummaryCard (class and assignment pages), ProjectCard (student class page) and ClassCard (student
// dashboard) with fixed data and a faked fetch (no backend). Each shows "Last analyzed 3 hours ago".
const scene = new URLSearchParams(location.search).get("scene") ?? "instructor-card";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
localStorage.setItem("ft_auth_token", "t");
window.fetch = (async (input: RequestInfo | URL) => {
  if (String(input).endsWith("/api/auth/me")) return json({ id: 1, email: "a@example.test", name: "Alexandria Montgomery-Castellanos", systemRole: scene === "instructor-card" ? "INSTRUCTOR" : "STUDENT", instructorStatus: "APPROVED" });
  return json({ error: "not found" }, 404);
}) as typeof fetch;

const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
const names = ["Alexandria Montgomery-Castellanos", "Ben Cruz", "Carla Dela Cruz"];

const item = {
  projectId: 1, groupName: "Group Alexandria-Montgomery-Castellanos-and-friends", assignmentLabel: "CC-APPSDEV22 — Applications Development",
  classId: 1, assignmentId: 1, sourceType: "COMBINED", memberCount: 3, teamHealth: "Healthy", gini: 0.1,
  memberShares: names.map((studentName) => ({ studentName, contributionShare: 1 / 3, flags: [] })),
  flagsPresent: [], lastAnalyzedAt: threeHoursAgo, isAnalyzed: true, membershipChangedAt: null, scoringConfigChangedAt: null,
  settingsOutdated: false, rulesOutdated: false, hasRepo: true,
} as unknown as ProjectSummaryItem;

const report = { teamHealth: "Healthy", generatedAt: threeHoursAgo };
const asgn = {
  id: 9, title: "Capstone project with a long title that needs to wrap", deadline: null, sourceType: "COMBINED", maxGroupSize: 4, description: null, attachments: [],
  myGroup: { id: 3, groupName: "Group Alexandria-Montgomery-Castellanos-and-friends", repoUrl: null, role: "MEMBER", pendingRequestCount: 0, report },
  myRequest: null, groups: [],
};
const cls = {
  id: 5, subjectCode: "CC-APPSDEV22", subjectName: "Applications Development", edpCode: "UXA634062", department: null, joinCode: "ABC123",
  assignments: [asgn],
};

function App() {
  if (scene === "student-class") {
    return <ProjectCard asgn={asgn as never} token="t" onNavigate={() => undefined} onManage={() => undefined} onChanged={() => undefined} />;
  }
  if (scene === "student-dashboard") return <ClassCard cls={cls as never} onNavigate={() => undefined} />;
  return <GroupSummaryCard item={item} onAnalyze={() => undefined} analyzing={false} onManage={() => undefined} onTasks={() => undefined} />;
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider>
      <RouterProvider>
        <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-6"><App /></main>
      </RouterProvider>
    </AuthProvider>
  </QueryClientProvider>,
);
