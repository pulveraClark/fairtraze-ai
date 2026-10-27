import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/geist";
import "../src/index.css";
import { RouterProvider } from "../src/router";
import { AuthProvider } from "../src/context/AuthContext";
import { Narrative } from "../src/components/Narrative";
import type { UseAiReview } from "../src/hooks/useAiReview";
import type { AiBriefCheck, AiReviewResponse } from "../src/lib/aiReview";

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

const long = "Document the whole deployment process, including environment variables and rollback steps for the team";
const req = (text: string, status: "FOUND" | "NOT_FOUND" | "PARTLY_FOUND", unverified = false) => ({ text, status, unverified, key: text, evidence: [] });
const requirements = [
  ...Array.from({ length: 6 }, (_, i) => req(`Requirement ${i + 1} is met`, "FOUND")),
  req(long, "NOT_FOUND"), req("Has automated tests", "NOT_FOUND", true), req("Has a README", "NOT_FOUND"),
] as AiBriefCheck["requirements"];
const data: AiReviewResponse = {
  enabled: true, running: false, canGenerate: true, hasReport: true, summaries: [],
  briefCheck: { generatedAt: "2026-10-26T01:00:00Z", outdated: false, nothingFound: false, requirements },
};
const review: UseAiReview = { data, error: null, start: async () => true };
const generator = { generating: false, error: null, generate: async () => {}, busy: false, slow: false, upToDate: null, announcement: "" } as never;

function Page() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <Narrative narrative={"This project has a team health of Healthy.\n\nThe Gini coefficient is 0.122."} projectId={1} onNarrativeGenerated={() => {}}
        review={review} generator={generator} basedOnAt="2026-10-26T01:00:00Z" teamHealth="Healthy" gini={0.122} />
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
