// All short (?) tooltip texts and the Help page anchors, in one place. Display only: nothing here
// reads or changes a score. Every tip is one or two plain sentences (helpText.test.ts enforces it).
// Numbers that the scoring code owns are never typed here; they are passed in by the caller.

/** Anchors on the /help page. HelpPage renders an element with each of these ids. */
export const HELP_ANCHORS = [
  "what", "shares", "shares-github", "shares-docs", "combined", "settings",
  "flags", "gini", "ai", "tasks", "github-link", "roles", "leader", "notes", "privacy", "faq",
] as const;
export type HelpAnchor = (typeof HELP_ANCHORS)[number];

/** `/help#shares` etc. */
export function helpLink(anchor: HelpAnchor): string {
  return `/help#${anchor}`;
}

const pct = (x: number) => `${+x.toFixed(1)}%`;

/** Shown to students (and to instructors where the same screen is shared). No Gini wording. */
export const TIPS = {
  roles: "Roles are labels for context. They never change anyone's score.",
  adminLastActive: "Last active is the most recent sign-in or session refresh. Accounts that have not signed in since this was added show as Never.",
  rolesLeader: "Roles are labels for context and never change anyone's score. Set them in Manage Group.",
  leaderBadge: "The leader is the group's contact. It gives no extra credit; everyone is scored on their own activity.",
  repoLink: "FairTraze reads commit activity from this repository. Make it public so the link can be checked.",
  githubUsername: "Your username is how FairTraze matches commits to you. Add it once in Settings.",
  tasksPlanning: "Tasks are for planning. They are never counted in anyone's score.",
  shortcuts: "Press ? on the board to see every keyboard shortcut. Shortcuts pause while you type.",
  leaderTeam: "This view helps your group share the work. Shares come from recorded activity, are not grades, and your instructor makes the final assessment.",
  evenness: "Compares everyone's recorded activity to show how evenly work is spread. It describes the team, not you.",
  flagBasisDeadline: "The last third is counted from the group's first recorded activity up to the assignment deadline.",
  flagBasisSpan: "No deadline was set, so the last third is counted across the group's first-to-last recorded activity.",
  scoreBlend: "Your combined share is your GitHub share and your Docs share blended with these weights. Your instructor sets them.",
  narrative: "A formula works out every number and flag. The AI only describes them in words, writes short work summaries that may be wrong, and never changes a number or gives a grade.",
  workSummary: "Written by AI from this member's commits and their own part of the Docs. It can be wrong, so check the evidence.",
  authorship: "Colors show who typed each part of the document. Turn it off to read without colors.",
  equalShareMember: (equalPct: number, members: number) =>
    `The marker is an equal split of the work: ${pct(equalPct)} each for ${members} members. It is a reference point, not a target.`,
  equalShareList: (equalPct: number) =>
    `The marker on each bar is an equal split of the work (${pct(equalPct)} each), so you can see who is above or below it.`,
} as const;

/** Scoring settings (instructors only). */
export const SETTINGS_TIPS = {
  weights: "How much commits, lines and active days each count toward a member's share. They must add up to 1.",
  blend: "How much GitHub and Docs each count when a project uses both. They must add up to 1.",
  commits: "Number of commits, with diminishing returns so many tiny commits don't win.",
  lines: "Lines added: code counts in full, comments a quarter and blank lines nothing, then by file type and commit size. Deleting your own lines lowers it a little.",
  activeDays: "Days (Philippine time) with at least one commit.",
  githubWeight: "How much a member's GitHub share counts in the combined share.",
  docsWeight: "How much a member's Docs share counts in the combined share.",
  freeRider: "Flag a member whose share is below this fraction of an equal split.",
  overload: "Flag a member whose share is above this multiple of an equal split.",
  deadlineDriven: "Flag a member with more than this share of activity in the last third of the time.",
} as const;
