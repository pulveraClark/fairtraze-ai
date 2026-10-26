import { LINE_TYPE_WEIGHTS } from "@shared/lineClassifier";

export interface HelpFaqItem { id: string; q: string; a: string }

/** "Questions students ask" on the Help page. Numbers come from the scoring constants, never typed. */
export const HELP_FAQ: HelpFaqItem[] = [
  { id: "faq-share-small", q: "My share looks small although I worked a lot. Why?",
    a: "Your share compares you with the recorded work of the whole group. Work done offline, in meetings, on someone else's computer or in a tool FairTraze cannot see is invisible. Add a note and your instructor can take it into account." },
  { id: "faq-why-share-low", q: "Why is my share lower than a teammate's?",
    a: "Shares are relative: they compare everyone's recorded work. Lines are weighted by file type, and generated files and merge commits add nothing. Deleting your own work soon after writing it lowers your score, and commits are counted on a log scale, so many tiny ones add little. Flags are context for your instructor, not a grade." },
  { id: "faq-padding", q: "Does making lots of commits or many small edits raise my share?",
    a: "Only a little. Commits and editing sessions are counted on a log scale, so extra tiny ones add little. Lines and kept text are worth more or less by file type and edit type, and writing then deleting your own work lowers your score." },
  { id: "faq-link-github", q: "How do I link GitHub?",
    a: "Save your own GitHub username once in Settings; it is used in every group. For the group's repository, any member can add the first link from the group page, and after that only the leader can change it. Make sure the repository is public, or ask your instructor how to share it." },
  { id: "faq-merges", q: "Do merge commits count?",
    a: "No. Merge commits are left out because they carry work that was already credited to the people who wrote it. Commits you author yourself, including squashed ones, count." },
  { id: "faq-images", q: "Do images count?",
    a: "No. Images and other non-text items add nothing to a share today. They are visible in the document, so your instructor can see them." },
  { id: "faq-comments", q: "Do comments or formatting count?",
    a: `Docs comments (the threads beside the document) are never scored, and formatting-only edits such as bold or headings add no share. In GitHub code, a comment line counts ${LINE_TYPE_WEIGHTS.comment} of a code line and a blank line counts ${LINE_TYPE_WEIGHTS.blank}.` },
  { id: "faq-leader", q: "Does the group leader get extra credit?",
    a: "No. Leadership is an administrative label. The leader is scored on their own activity only." },
  { id: "faq-one-source", q: "I only wrote in the document (or only coded). Is that a problem?",
    a: "No. In a project that uses both, the part you did not use counts as zero and the other part still counts. A soft note may appear if your role and your activity do not match." },
  { id: "faq-tasks", q: "Do tasks count toward my score?", a: "No. Tasks are planning only." },
  { id: "faq-work-summary", q: "What is the AI work summary, and can it be wrong?",
    a: "When your instructor has it switched on, an AI writes one or two neutral sentences about what you worked on, based on your commits and your own part of the document. Open See evidence to see the files and document sections it used. It can be wrong, it never changes a share or a flag, and it is not a grade. Your instructor and your group leader can also see it." },
  { id: "faq-brief-check", q: "What is the brief check?",
    a: "The instructor and the group leader can see an AI review that lists each requirement of the project brief and says whether it was found in the group's code or document, with quoted evidence. It only says whether something is present, not whether it is good, and it can be wrong. It never changes a share or a flag. Other members' document words are shown to the leader as section names only." },
  { id: "faq-ai", q: "Does the AI decide my grade or my flags?",
    a: "No. A formula sets every number and flag. The AI only describes them for your instructor, and only when your instructor asks for it. Your instructor makes the final assessment." },
  { id: "faq-update", q: "When does my report update?",
    a: "When your instructor runs the analysis. The report shows the date it was last analyzed, and activity after that appears at the next analysis." },
  { id: "faq-visibility", q: "Who can see my report and my writing?",
    a: "You and your instructor see your report. A leader also sees team shares. Everyone in the group can see the shared document, including who wrote which part, and its comments." },
];
