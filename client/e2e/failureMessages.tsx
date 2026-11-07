import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/geist";
import "../src/index.css";
import { AuthProvider } from "../src/context/AuthContext";
import { AnalysisFailedCard } from "../src/components/AnalysisFailedCard";
import { Narrative } from "../src/components/Narrative";
import { LastAnalyzed } from "../src/components/LastAnalyzed";
import type { AiReportGenerator } from "../src/hooks/useGenerateAiReport";
import { ANALYSIS_FAILURE_TEXT } from "@shared/failureMessages";
import { NETWORK_ERROR_TEXT } from "../src/lib/failureText";

// ?scene=analysis-failed | ai-findings | freshness
// The real AnalysisFailedCard (group report page), Narrative error/warning (AI findings card) and LastAnalyzed
// (report pages) with the final wording and a faked fetch (no backend). The notices on the class and assignment
// pages are one-line text boxes built from the same sentences; they are covered by the unit tests.
const scene = new URLSearchParams(location.search).get("scene") ?? "analysis-failed";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
localStorage.setItem("ft_auth_token", "t");
window.fetch = (async (input: RequestInfo | URL) => {
  if (String(input).endsWith("/api/auth/me")) return json({ id: 1, email: "a@example.test", name: "Prof", systemRole: "INSTRUCTOR", instructorStatus: "APPROVED" });
  return json({ error: "not found" }, 404);
}) as typeof fetch;

const gen = (over: Partial<AiReportGenerator>): AiReportGenerator => ({
  reviewOn: false, generating: false, error: null, warning: null, generate: async () => {}, upToDate: null, busy: false, slow: false, announcement: "", ...over,
});

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function App() {
  if (scene === "ai-findings") {
    return (
      <main className="mx-auto w-full min-w-0 max-w-3xl space-y-4 px-4 py-6">
        <Narrative narrative={null} projectId={1} onNarrativeGenerated={() => undefined}
          generator={gen({ error: "The AI explanation is unavailable right now. The scores and flags are not affected. Try again later." })} />
        <Narrative narrative="Saved text." projectId={1} onNarrativeGenerated={() => undefined}
          generator={gen({ warning: "The new explanation could not be written, so the saved one is shown. Try again later." })} />
        <Narrative narrative={null} projectId={1} onNarrativeGenerated={() => undefined}
          generator={gen({ error: "The AI's daily limit was reached. It is available again around 3:00 PM (in about 4 hours)." })} />
      </main>
    );
  }
  if (scene === "freshness") {
    return (
      <main className="mx-auto w-full min-w-0 max-w-3xl space-y-4 px-4 py-6">
        <LastAnalyzed analyzedAt={ago(3 * 86_400_000)} trigger="auto" updateFailed />
        <LastAnalyzed variant="student" analyzedAt={ago(3 * 86_400_000)} updateFailed />
        <LastAnalyzed analyzedAt={ago(3 * 3_600_000)} trigger="auto" />
      </main>
    );
  }
  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl space-y-4 px-4 py-6">
      {Object.values(ANALYSIS_FAILURE_TEXT).map((m) => <AnalysisFailedCard key={m} message={m} onDismiss={() => undefined} />)}
      <AnalysisFailedCard message={NETWORK_ERROR_TEXT} onDismiss={() => undefined} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider><App /></AuthProvider>
  </QueryClientProvider>,
);
