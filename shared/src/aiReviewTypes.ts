// Shapes of the AI review stored in AiReportReview.content and returned by the API. Types only:
// nothing here is read by scoring, flags, Gini or team health.

export type AiSummarySource = "ai" | "facts";

// A link to one commit on GitHub (short sha shown, full link behind it).
export interface AiEvidenceLink {
  sha: string;
  href: string;
}

// Added by the API at read time (never stored): where a file's evidence links to.
export interface AiFileLinks {
  href?: string;
  // True when href is a commit diff, false when it is the file on the default branch.
  isCommit?: boolean;
  // Other commits that touched the file, newest first.
  more?: AiEvidenceLink[];
}

export interface AiSummaryEvidence {
  // commits: shas of the commits that touched the file, newest first (stored with the review).
  files: Array<{ path: string; added: number; removed: number; commits?: string[] } & AiFileLinks>;
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
  // Files only: shas of the commits that touched the file, newest first, when known.
  commits?: string[];
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
  // Where the requirement comes from, confirmed in code: the sentence of the written brief (<= 200
  // characters, found in the text that was sent), and/or the attached file's name (and page, when given).
  // Absent on checks stored before sources were required.
  sourceQuote?: string;
  sourceFile?: string;
  sourcePage?: number;
}

export type AiSkipReason = "TOO_LARGE" | "TOO_MANY_PAGES" | "UNSUPPORTED" | "TOO_MANY_FILES" | "TOTAL_TOO_LARGE" | "UNREADABLE";

// What the brief check read. Names and counts only; file contents are never stored.
export interface AiBriefSources {
  writtenBrief: boolean;
  filesRead: number;
  skipped: Array<{ filename: string; reason: AiSkipReason }>;
  // Requirements the AI returned that were left out because their source could not be confirmed.
  droppedCount?: number;
}

export interface AiBriefContent {
  requirements: AiBriefRequirement[];
  // Absent on checks stored before attachments were read.
  sources?: AiBriefSources;
  // Count of lines of student text that addressed the AI and were replaced before sending.
  aiAddressedCount: number;
}
