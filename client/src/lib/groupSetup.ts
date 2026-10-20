// "Set up your group": steps, progress and the live repository-link check. Pure functions so the card's
// states are testable without a browser. Display only; nothing here is read by scoring.

import { checkRepoUrl } from "@shared/repoUrl";

/** GET /api/groups/:id/setup */
export interface GroupSetup {
  needsRepo: boolean;
  repoUrl: string | null;
  repoLinked: boolean;
  isLeader: boolean;
  canLinkRepo: boolean;
  canChangeRepo: boolean;
  viewerHasGithubUsername: boolean;
  usernames: { linked: number; total: number; missingNames: string[] };
}

export type SetupStepId = "create" | "link" | "usernames";

export interface SetupStep {
  id: SetupStepId;
  title: string;
  done: boolean;
}

export interface SetupProgress {
  steps: SetupStep[];
  doneCount: number;
  total: number;
  complete: boolean;
  /** "not-started" | "partial" | "done" - the card's three states. */
  state: "not-started" | "partial" | "done";
  label: string; // "2 of 3 done"
}

/**
 * Step 1 cannot be observed (we never see the repository being created), so it counts as done once the
 * link is saved. Docs-only groups have no steps at all and are always "done".
 */
export function deriveSetupProgress(setup: GroupSetup): SetupProgress {
  const usernamesDone = setup.usernames.total > 0 && setup.usernames.linked >= setup.usernames.total;
  const steps: SetupStep[] = setup.needsRepo
    ? [
        { id: "create", title: "Create a GitHub repository", done: setup.repoLinked },
        { id: "link", title: "Paste the repository link", done: setup.repoLinked },
        { id: "usernames", title: "Everyone adds their GitHub username", done: usernamesDone },
      ]
    : [];
  const doneCount = steps.filter((s) => s.done).length;
  const complete = steps.every((s) => s.done);
  return {
    steps,
    doneCount,
    total: steps.length,
    complete,
    state: complete ? "done" : doneCount === 0 ? "not-started" : "partial",
    label: `${doneCount} of ${steps.length} done`,
  };
}

/** The card shows only while setup is incomplete, and never for a Docs-only group. */
export function setupCardVisible(setup: GroupSetup | undefined): boolean {
  return !!setup && setup.needsRepo && !deriveSetupProgress(setup).complete;
}

export function membersLinkedLine(u: GroupSetup["usernames"]): string {
  return `${u.linked} of ${u.total} members linked`;
}

export type RepoFeedback =
  | { kind: "empty" }
  | { kind: "ok"; url: string; shown: string }
  | { kind: "error"; message: string };

/**
 * Live check of the pasted link. Errors wait until the person has left the field or typed enough to
 * be a real attempt, so "https://g" is not shouted at; a valid link is confirmed at once.
 */
export function repoFeedback(value: string, touched: boolean): RepoFeedback {
  const trimmed = value.trim();
  if (!trimmed) return touched ? { kind: "error", message: checkMessage(value) } : { kind: "empty" };
  const r = checkRepoUrl(trimmed);
  if (r.ok) return { kind: "ok", url: r.url, shown: `github.com/${r.owner}/${r.repo}` };
  return touched || trimmed.length >= 15 ? { kind: "error", message: r.message } : { kind: "empty" };
}

function checkMessage(value: string): string {
  const r = checkRepoUrl(value);
  return r.ok ? "" : r.message;
}
