import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/geist";
import "../src/index.css";
import type { AnyScoredMember } from "@shared/types";
import { RouterProvider } from "../src/router";
import { AuthProvider } from "../src/context/AuthContext";
import { MemberContributionList } from "../src/components/report/MemberContributionList";
import { Narrative } from "../src/components/Narrative";
import { useGenerateAiReport } from "../src/hooks/useGenerateAiReport";
import type { UseAiReview } from "../src/hooks/useAiReview";
import type { AiReviewResponse } from "../src/lib/aiReview";

// The two report cards with the AI review "running". Local data only, no backend.
localStorage.setItem("ft_auth_token", "t");
const user = { id: 1, email: "member.a@example.com", name: "Member A", systemRole: "INSTRUCTOR", instructorStatus: "APPROVED", emailVerified: true, consentRequired: false, consentVersion: "1.3" };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
window.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/auth/refresh")) return json({ token: "t", user });
  if (url.includes("/api/auth/me")) return json(user);
  return json([]);
}) as typeof fetch;

const members = ["Member A", "Member B", "Member C"].map((studentName, i) => ({
  studentName, contributionShare: [0.45, 0.35, 0.2][i], flags: [], commits: 10, activeDays: 4,
})) as unknown as AnyScoredMember[];
const data: AiReviewResponse = { enabled: true, running: true, canGenerate: true, hasReport: true, summaries: null };
const review: UseAiReview = { data, error: null, start: async () => true };

function Page() {
  const generator = useGenerateAiReport(1, review, () => {});
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <MemberContributionList members={members} onOpen={() => {}} generator={generator} aiSummaryState="running" />
      <Narrative narrative={null} projectId={1} onNarrativeGenerated={() => {}} review={review} generator={generator} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <RouterProvider>
      <AuthProvider>
        <Page />
      </AuthProvider>
    </RouterProvider>
  </QueryClientProvider>,
);
