import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/geist";
import "../src/index.css";
import { RouterProvider } from "../src/router";
import { AuthProvider } from "../src/context/AuthContext";
import { ToastProvider } from "../src/components/Toast";
import App from "../src/App";

// The real app at /student/group/1 with a faked API (no backend, no database). ?role=LEADER|MEMBER, ?report=0|1.
const params = new URLSearchParams(location.search);
localStorage.setItem("ft_auth_token", "t");
const role = params.get("role") === "MEMBER" ? "MEMBER" : "LEADER";
const hasReport = params.get("report") !== "0";

const student = {
  id: 1, email: "member.a@example.com", name: "Member A", systemRole: "STUDENT",
  emailVerified: true, consentRequired: false, consentVersion: "1.1",
};
const group = {
  classSection: { id: 5, subjectCode: "IT-ELEC 2", subjectName: "Electives", department: null, edpCode: "UXA634062" },
  assignment: { id: 9, title: "Project", deadline: null, sourceType: "COMBINED", description: "Build the project.", attachments: [] },
  project: { id: 1, groupName: "Group 1", repoUrl: "" },
  membership: { role, functionalRoles: ["DEVELOPER"], joinedAt: "2026-10-01T00:00:00Z", roleSuggestion: null },
  hasReport,
  report: hasReport ? {
    evenness: "a-bit-uneven", analyzedAt: "2026-10-18T00:00:00Z", memberCount: 3, deadlineWindowBasis: "activity-span",
    myContribution: {
      sourceType: "COMBINED", contributionShare: 0.4, githubContributionShare: 0.5, documentContributionShare: 0.3,
      wGitHub: 0.5, wDocs: 0.5, flags: [], commits: 3, activeDays: 2,
    },
  } : null,
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
window.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/auth/refresh")) return json({ token: "t", user: student });
  if (url.includes("/api/auth/me")) return json(student);
  if (url.includes("/api/student/group/1")) return json(group);
  if (url.includes("/api/groups/1/setup")) {
    return json({
      needsRepo: false, repoUrl: "https://github.com/acme/app", repoLinked: true, isLeader: role === "LEADER",
      canLinkRepo: false, canChangeRepo: role === "LEADER", viewerHasGithubUsername: true,
      usernames: { linked: 3, total: 3, missingNames: [] },
    });
  }
  return json([]);
}) as typeof fetch;

history.replaceState(null, "", "/student/group/1");

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RouterProvider>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </RouterProvider>
  </QueryClientProvider>,
);
