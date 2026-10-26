// Shapes of the AI review stored in AiReportReview.content and returned by the API. Types only:
// nothing here is read by scoring, flags, Gini or team health.

export type AiSummarySource = "ai" | "facts";

export interface AiSummaryEvidence {
  files: Array<{ path: string; added: number; removed: number }>;
  // Headings of the Docs sections the member wrote under.
  docSections: string[];
  commitCount: number;
  // Commits left out of the summary (older than the newest ones considered).
  otherCommits: number;
}

export interface AiMemberSummary {
  userId: number;
  summary: string;
  // "facts" = no AI sentence (AI unavailable or its text was rejected); the line only lists changed files.
  source: AiSummarySource;
  evidence: AiSummaryEvidence;
}

// Lines of student text that addressed the AI and were replaced before sending. Instructor only.
export interface AiAddressedNote {
  userId: number;
  where: "commits" | "docs";
  count: number;
}

export interface AiMemberSummariesContent {
  members: AiMemberSummary[];
  aiAddressed: AiAddressedNote[];
}

export type AiReviewStatus = "OK" | "PARTIAL" | "FAILED" | "SKIPPED";
