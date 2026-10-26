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

// ── Brief comparison (instructor and group leader) ──────────────────────────────────────────────

export type AiRequirementStatus = "FOUND" | "PARTLY_FOUND" | "NOT_FOUND";

export interface AiBriefEvidence {
  type: "file" | "doc";
  // File path, or Docs section heading.
  ref: string;
  // Short text copied from that file or section. Verified in code before it is stored.
  quote: string;
  // Docs only: ids of the members who wrote the quoted text. Used to hide other members' Docs words
  // from the leader; never sent to the client.
  authors?: number[];
}

export interface AiBriefRequirement {
  text: string;
  status: AiRequirementStatus;
  evidence: AiBriefEvidence[];
  // True when the AI said Found/Partly but none of its quotes could be verified.
  unverified?: boolean;
}

export interface AiBriefContent {
  requirements: AiBriefRequirement[];
  // Count of lines of student text that addressed the AI and were replaced before sending.
  aiAddressedCount: number;
}
