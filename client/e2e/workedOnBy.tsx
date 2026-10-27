import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/geist";
import "../src/index.css";
import { RouterProvider } from "../src/router";
import { AuthProvider } from "../src/context/AuthContext";
import { DocSectionProvider } from "../src/hooks/useDocSectionLink";
import { BriefCheckCard } from "../src/components/BriefCheckCard";
import type { AiBriefCheck } from "../src/lib/aiReview";

// The Project instructions check with the "Worked on by" rows (leader view). Local data only, no backend.
localStorage.setItem("ft_auth_token", "t");
const user = { id: 1, email: "member.a@example.com", name: "Member A", systemRole: "STUDENT", emailVerified: true, consentRequired: false, consentVersion: "1.3" };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
window.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/auth/refresh")) return json({ token: "t", user });
  if (url.includes("/api/auth/me")) return json(user);
  return json([]);
}) as typeof fetch;

const r = (over: object) => ({ status: "FOUND", unverified: false, evidence: [], sourceQuote: "q", ...over });
const check = {
  generatedAt: "2026-10-27T00:00:00Z", outdated: false, nothingFound: false,
  requirements: [
    r({ text: "Build a route planner with a graphical interface.", status: "PARTLY_FOUND", contributors: ["Aldren B.", "Maria Clara D.", "Zed Z."] }),
    r({ text: "Write the system documentation for the whole project.", status: "NOT_FOUND", contributors: [] }),
    r({ text: "Add automated tests.", status: "NOT_FOUND", unverified: true, contributors: [] }),
    r({ text: "Use a database.", contributors: [] }),
  ],
} as unknown as AiBriefCheck;

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <RouterProvider>
      <AuthProvider>
        <DocSectionProvider>
          <div className="mx-auto max-w-2xl p-4"><BriefCheckCard check={check} /></div>
        </DocSectionProvider>
      </AuthProvider>
    </RouterProvider>
  </QueryClientProvider>,
);
