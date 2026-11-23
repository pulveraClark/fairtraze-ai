import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "../src/index.css";
import { LeaderTeamCard, type LeaderTeamMember } from "../src/components/LeaderTeamCard";

// The leader's Team contributions card (Combined, 50/50) with local data only. No backend.
const m = (userId: number, name: string, gh: number, dc: number, over: Partial<LeaderTeamMember> = {}): LeaderTeamMember => ({
  userId, name, isLeader: false, functionalRoles: ["DEVELOPER"], hasAvatar: false, avatarUpdatedAt: null,
  contributionShare: 0.5 * gh + 0.5 * dc, githubContributionShare: gh, documentContributionShare: dc,
  flags: [], tasks: { open: 2, done: 1 }, ...over,
});
const team = [
  m(1, "Member A", 0.48, 0.118, { isLeader: true }),
  m(2, "Member B", 0.3, 0.55, { functionalRoles: ["DEVELOPER", "DOCUMENTATION"] }),
  m(3, "Member C", 0.02, 0.012, { flags: ["free-rider"] }),
];

createRoot(document.getElementById("root")!).render(
  <div className="mx-auto max-w-2xl p-4">
    <LeaderTeamCard team={team} sourceType="COMBINED" blend={{ wGitHub: 0.5, wDocs: 0.5 }} currentUserId={1} onOpenMember={() => {}} />
  </div>,
);
