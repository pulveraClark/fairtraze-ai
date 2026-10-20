import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "../src/index.css";
import { GroupSetupCard } from "../src/components/GroupSetupCard";
import { SetupNudgeBar } from "../src/components/SetupNudgeBar";
import { NextStepLine } from "../src/components/NextStepLine";
import type { GroupSetup } from "../src/lib/groupSetup";

// The real card and Next-step line with fixed data and a faked save, no backend. ?state=... picks the state.
const base: GroupSetup = {
  needsRepo: true, repoUrl: null, repoLinked: false, isLeader: false, canLinkRepo: true, canChangeRepo: false,
  viewerHasGithubUsername: false, usernames: { linked: 0, total: 5, missingNames: ["Ana Cruz", "Ben Lim", "Cy Dee", "Dana Uy", "Eli Ong"] },
};
const partial: GroupSetup = {
  ...base, repoLinked: true, repoUrl: "https://github.com/acme/capstone-team-project", canLinkRepo: false,
  usernames: { linked: 3, total: 5, missingNames: ["Cy Dee", "Eli Ong"] },
};
const leaderPartial: GroupSetup = { ...partial, isLeader: true, canChangeRepo: true, viewerHasGithubUsername: true };

const state = new URLSearchParams(location.search).get("state") ?? "not-started";
const setups: Record<string, GroupSetup | null> = {
  "not-started": base,
  "format-error": base,
  "server-error": base,
  partial,
  "leader-partial": leaderPartial,
  nudge: null,
  "next-step": null,
  "all-set": null,
};

// Pretend GitHub cannot find the repository, with the exact wording the server sends.
window.fetch = (async () =>
  new Response(JSON.stringify({
    code: "REPO_NOT_FOUND",
    error: "We couldn't find that repository, or it is private. Make the repository public, or ask your instructor how to share it.",
  }), { status: 422, headers: { "Content-Type": "application/json" } })) as typeof fetch;

const setup = setups[state] ?? base;

createRoot(document.getElementById("root")!).render(
  <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-8 sm:px-8">
    {setup && <GroupSetupCard projectId={1} setup={setup} token="t" onSaved={() => undefined} />}
    {state === "nudge" && <SetupNudgeBar projectId={1} setup={leaderPartial} token="t" onSaved={() => undefined} />}
    {state === "next-step" && <NextStepLine text="You have 2 tasks due Friday" onOpenTasks={() => undefined} />}
    {state === "all-set" && <NextStepLine text="All set ✓" />}
  </main>,
);
