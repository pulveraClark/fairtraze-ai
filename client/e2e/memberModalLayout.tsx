import { useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "../src/index.css";
import type { CombinedScoredMember, DocumentScoredMember, ScoredMember } from "@shared/types";
import { MemberDrawer } from "../src/components/report/MemberDrawer";

const github: ScoredMember = {
  studentName: "Alexandria Montgomery-Castellanos", githubUsername: "alex", commits: 42, additions: 5200, deletions: 900, churn: 6100, activeDays: 12,
  lastPhaseRatio: 0.7, commitShare: 0.3, linesShare: 0.3, activeDaysShare: 0.3, contributionShare: 0.4,
  codeLinesAdded: 4800, commentLinesAdded: 300, blankLinesAdded: 100, codeToCommentRatio: 16, weightedAdditions: 4300, selfChurnRatio: 0.12,
  commitImpactBreakdown: { structural: 4, functional: 30, cosmetic: 6, trivial: 2 },
  fileTypeBreakdown: { source: 3000, test: 800, docs: 400, style: 500, config: 400, other: 100 },
  flags: ["deadline-driven", "overload"],
};
const docs: DocumentScoredMember = {
  studentName: "x", userId: 1, githubUsername: "", sessionCount: 9, totalInsertedChars: 12000, totalDeletedChars: 2000,
  retainedChars: 9000, effectiveRetainedChars: 8800, churn: 14000, activeDays: 6, lastPhaseRatio: 0.4,
  sessionShare: 0.3, retainedTextShare: 0.3, activeDaysShare: 0.3, contributionShare: 0.3, selfChurnRatio: 0.05,
  weightedRetainedChars: 8000, editTypeBreakdown: { substantive: 30, revision: 10, formatting: 4, trivial: 2 },
  flags: [], importedRetainedChars: 1500, importNote: "est", insertedImageCount: 2,
};
const combined = (name: string, flags: string[]): CombinedScoredMember => ({
  studentName: name, userId: 1, githubUsername: "alex", githubContributionShare: 0.45, documentContributionShare: 0.3,
  wGitHub: 0.5, wDocs: 0.5, contributionShare: 0.375, lastPhaseRatio: 0.55, flags, github, document: docs,
});
const names = ["Alexandria Montgomery-Castellanos", "Ben Cruz", "Ana Reyes"];

function App() {
  const [i, setI] = useState(0);
  return (
    <MemberDrawer
      member={combined(names[i], i === 0 ? ["deadline-driven", "overload"] : [])}
      onClose={() => undefined}
      position={{ index: i, total: names.length }}
      onPrev={() => setI((n) => Math.max(0, n - 1))}
      onNext={() => setI((n) => Math.min(names.length - 1, n + 1))}
      source="combined"
      thresholds={{ freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 }}
      deadlineBasis="assignment-deadline"
      memberCount={3}
    />
  );
}

createRoot(document.getElementById("root")!).render(<App />);
