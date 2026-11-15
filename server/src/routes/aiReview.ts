import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { studentSafeText } from "../lib/studentNarrative.js";
import { requireAuth, requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { loadGroup, loadGroupShared, isInstructorOf, type LoadedGroup } from "../lib/groupAccess.js";
import { LATEST_REPORT_ORDER } from "../lib/latestReport.js";
import { aiReviewEnabled } from "../lib/geminiClient.js";
import { isReviewRunning, lastUpToDate, recordUpToDate, startReview } from "../lib/aiReview/reviewLock.js";
import { generateMemberSummaries } from "../lib/aiReview/memberSummaries.js";
import { generateBriefComparison } from "../lib/aiReview/briefComparison.js";
import { briefFingerprint } from "../lib/aiReview/briefEvidence.js";
import { attachmentMetaFor } from "../lib/briefAttachments.js";
import { activeQuotaLimit } from "../lib/aiFailureText.js";
import { isMarkStale, requirementKeys } from "../lib/requirementMarks.js";
import { AI_REVIEW_PROMPT_VERSION, BRIEF_PROMPT_VERSION } from "../lib/aiReview/prompts.js";
import { canonicalRepoUrl, linkFile, linkFileAtCommit, repoRefOf, type RepoRef } from "../lib/aiReview/evidenceLinks.js";
import { contributorsFor, evidenceShas, hasHeadingProof, headingAuthorIds, type ContributorLookup } from "../lib/aiReview/contributors.js";
import { loadGroupDocEvidence } from "../lib/aiReview/docsEvidence.js";
import type {
  AiMemberSummariesContent, AiMemberSummary, AiAddressedNote, AiBriefContent, AiBriefSources, AiRequirementStatus, AiFileLinks, AiLastAttempt,
} from "@shared/aiReviewTypes.js";

export const aiReviewRouter = Router();

export type AiViewer = "instructor" | "leader" | "member";

export interface AiMemberSummaryView extends AiMemberSummary {
  name: string;
  // Lets the report match a GitHub-only member (who has no user id in the stored report).
  githubUsername: string | null;
  isYou: boolean;
}

export interface AiPerson {
  name: string;
  githubUsername: string | null;
}

// Who sees what, decided here and nowhere else:
//  - a member sees only their own summary;
//  - the group leader and the owning instructor see every member's summary;
//  - evidence is the same for all of them and holds only file paths and Docs section headings
//    (never document text), so a leader never reads another member's Docs words;
//  - "text addressed to the AI" notes, status and error codes are for the instructor only.
export function shapeSummariesForViewer(
  content: AiMemberSummariesContent,
  viewer: AiViewer,
  viewerUserId: number,
  people: Map<number, AiPerson>,
  repo: RepoRef | null = null,
): { summaries: AiMemberSummaryView[]; aiAddressed?: Array<AiAddressedNote & { name: string }> } {
  const visible = viewer === "member" ? content.members.filter((m) => m.userId === viewerUserId) : content.members;
  const link = (m: AiMemberSummary) =>
    // Links are built here, at read time, from the stored shas; `commits` itself is not sent.
    m.evidence.files.map(({ commits, ...f }) => ({ ...f, ...(linkFile(repo, f.path, commits) ?? {}) }));
  if (viewer !== "instructor") {
    // Students and leaders get a whitelist, built field by field (nothing is removed from a bigger object, so a
    // field added later never leaks). The text goes through studentSafeText: no percentages, no team measures,
    // no "free-rider". A summary with nothing clean left is left out.
    const summaries: AiMemberSummaryView[] = [];
    for (const m of visible) {
      const summary = typeof m.summary === "string" ? studentSafeText(m.summary) : "";
      if (!summary) continue;
      summaries.push({
        userId: m.userId,
        name: people.get(m.userId)?.name ?? "Former member",
        isYou: m.userId === viewerUserId,
        summary,
        source: m.source,
        githubUsername: null,
        evidence: {
          files: link(m),
          docSections: m.evidence.docSections,
          commitCount: m.evidence.commitCount,
          otherCommits: m.evidence.otherCommits,
        },
      });
    }
    return { summaries };
  }
  const summaries = visible.map((m) => ({
    ...m,
    evidence: { ...m.evidence, files: link(m) },
    name: people.get(m.userId)?.name ?? "Former member",
    githubUsername: people.get(m.userId)?.githubUsername ?? null,
    isYou: m.userId === viewerUserId,
  }));
  return {
    summaries,
    aiAddressed: content.aiAddressed.map((a) => ({ ...a, name: people.get(a.userId)?.name ?? "Former member" })),
  };
}

// What a student reads for one requirement, computed here: the raw status and the "unverified" flag are internal.
export type StudentRequirementState = "COVERED" | "PARTLY" | "NOT_FOUND" | "NOT_CONFIRMED" | "CONFIRMED";

export interface AiBriefView {
  requirements: Array<{
    text: string;
    status?: AiRequirementStatus; // instructor only
    unverified?: boolean; // instructor only
    // Group leader and plain member only (the instructor reads status/unverified).
    state?: StudentRequirementState;
    evidence: Array<{ type: "file" | "doc"; ref: string; quote: string; quoteHidden: boolean } & AiFileLinks>;
    // Where the requirement comes from (see AiBriefRequirement). Absent on older checks.
    sourceQuote?: string;
    sourceFile?: string;
    sourcePage?: number;
    // Instructor and leader only: "First L." names of the members who wrote the proof shown, sorted by name.
    contributors?: string[];
  }>;
  // True when no requirement was found (all Not found). The page shows one calm line.
  nothingFound: boolean;
  // True when files were attached but none could be read and there is no written brief, so nothing was
  // checked (no AI call was made). `sources.skipped` says why, file by file.
  nothingRead?: boolean;
  generatedAt: string;
  outdated: boolean;
  // What was read: the written brief and how many attached files, and which files were skipped (names only).
  // Absent on checks stored before attachments were read.
  sources?: AiBriefSources;
  // Instructor only.
  aiAddressedCount?: number;
}

// How many listed items were left out because the instructions do not contain them is a note about the AI's
// answer for the instructor only; the leader never receives the count.
function sourcesFor<S extends { droppedCount?: number }>(sources: S, viewer: AiViewer): S {
  if (viewer === "instructor") return sources;
  const { droppedCount: _dropped, ...rest } = sources;
  return rest as S;
}

// The brief check is for the owning instructor and the group leader, never other members.
// Same wording and evidence for both; the leader sees only the section heading, not the quoted words,
// for Docs text written by anyone else. Returns null (card hidden) when there is no brief (no text and no
// attachment), the run failed or was skipped, or the AI listed no requirements. The one skipped run that is
// shown is "nothing read": files attached, none readable, no written brief. `attachments` is metadata only.
export function shapeBriefForViewer(
  row: { status: string; content: unknown; promptVersion: string; briefHash: string | null; reportId: number; createdAt: Date } | null,
  viewer: AiViewer,
  viewerUserId: number,
  current: { brief: string; attachments?: Array<{ id: number; size: number; mime: string }>; latestReportId: number | null },
  repo: RepoRef | null = null,
  who?: ContributorLookup,
  // Keys the owning instructor confirmed (current marks only). A leader's claim never counts.
  confirmed: ReadonlySet<string> = new Set(),
): AiBriefView | null {
  const attachments = current.attachments ?? [];
  if (!row || (!current.brief.trim() && attachments.length === 0)) return null;
  if (row.status === "FAILED") return null;
  const content = row.content as AiBriefContent;
  const outdated =
    row.reportId !== current.latestReportId || row.promptVersion !== BRIEF_PROMPT_VERSION || row.briefHash !== briefFingerprint(current.brief, attachments);
  if (row.status === "SKIPPED") {
    const s = content.sources;
    if (!s || s.writtenBrief || s.filesRead > 0 || s.skipped.length === 0) return null;
    return { requirements: [], nothingFound: false, nothingRead: true, generatedAt: row.createdAt.toISOString(), outdated, ...(viewer === "instructor" ? { sources: sourcesFor(s, viewer) } : {}) };
  }
  if (!content.requirements?.length) return null;
  const keys = requirementKeys(content.requirements);
  const all = content.requirements.map((r, i) => {
    const key = keys[i] ?? undefined;
    const evidence = r.evidence.map((e) => {
      const othersWrote = e.type === "doc" && viewer !== "instructor" && !!e.quote && (!e.authors || e.authors.length === 0 || e.authors.some((a) => a !== viewerUserId));
      // A code proof read at a pinned commit links to the file (and the quoted lines) at that commit; older
      // checks keep the commit link. The code quote is shown only when it was confirmed safe to show.
      const links = e.type === "file" ? (linkFileAtCommit(repo, e.ref, e.headSha, e.lines) ?? linkFile(repo, e.ref, e.commits) ?? {}) : {};
      const quote = e.type === "file" ? (e.quoteSafe ? e.quote : "") : othersWrote ? "" : e.quote;
      return { type: e.type, ref: e.ref, quote, quoteHidden: othersWrote, ...(e.heading ? { heading: true } : {}), ...links };
    });
    const source = {
      ...(r.sourceQuote ? { sourceQuote: r.sourceQuote } : {}),
      ...(r.sourceFile ? { sourceFile: r.sourceFile } : {}),
      ...(r.sourceFile && r.sourcePage ? { sourcePage: r.sourcePage } : {}),
    };
    if (viewer === "instructor") {
      return { key, text: r.text, status: r.status, unverified: !!r.unverified, ...source, evidence };
    }
    // Student view: a plain state word's worth of information and nothing else. Built field by field.
    const state: StudentRequirementState =
      r.unverified ? "NOT_CONFIRMED"
      : r.status === "FOUND" ? "COVERED"
      : key && confirmed.has(key) ? "CONFIRMED"
      : r.status === "PARTLY_FOUND" ? "PARTLY" : "NOT_FOUND";
    return {
      // The key is only for the leader's "We have this"; a plain member has nothing to claim.
      ...(viewer === "leader" ? { key } : {}),
      text: r.text,
      state,
      ...source,
      ...(who && viewer === "leader" ? { contributors: contributorsFor(r.evidence, who) } : {}),
      evidence,
    };
  });
  const base = { generatedAt: row.createdAt.toISOString(), outdated };
  if (viewer !== "instructor") {
    return { requirements: all, nothingFound: (all as Array<{ state?: string }>).every((r) => r.state === "NOT_FOUND"), ...base };
  }
  return {
    requirements: all,
    nothingFound: (all as Array<{ status?: string }>).every((r) => r.status === "NOT_FOUND"),
    ...base,
    ...(content.sources ? { sources: sourcesFor(content.sources, viewer) } : {}),
    aiAddressedCount: content.aiAddressedCount ?? 0,
  };
}

export interface AiRefreshNote {
  // When the failed attempt happened, and the date of the check that is still shown (both ISO).
  at: string;
  shownFrom: string;
  errorCode: string;
  // Daily limit only: when it resets.
  retryAt?: string;
}

// Present only when a failed run left the previous good result in place (`keptLast`).
export function refreshNote(attempt: AiLastAttempt | undefined, shownFrom: Date | undefined): AiRefreshNote | undefined {
  if (!attempt?.keptLast || !shownFrom) return undefined;
  return { at: attempt.at, shownFrom: shownFrom.toISOString(), errorCode: attempt.errorCode, ...(attempt.retryAt ? { retryAt: attempt.retryAt } : {}) };
}

const idParam = z.coerce.number().int().positive();

async function classSwitchOn(project: LoadedGroup): Promise<boolean> {
  const classSectionId = project.assignment?.classSectionId;
  if (!classSectionId) return false;
  const cs = await prisma.classSection.findUnique({ where: { id: classSectionId }, select: { aiReviewEnabled: true } });
  return !!cs?.aiReviewEnabled;
}

// Reads for "Worked on by" (instructor and leader only; the caller never runs this for a plain member). Commit
// authors come from the stored digests (one line per commit) and are matched to the CURRENT members' GitHub
// usernames; heading-only Docs proof reads the saved document read-only. Any failure just leaves names out.
async function contributorLookup(project: LoadedGroup, requirements: Array<{ evidence: AiBriefContent["requirements"][number]["evidence"] }>): Promise<ContributorLookup> {
  const names = new Map(project.groupMemberships.map((m) => [m.userId, m.user.name]));
  const userByLogin = new Map(
    project.groupMemberships.filter((m) => m.user.githubUsername).map((m) => [m.user.githubUsername!.toLowerCase(), m.userId]),
  );
  const loginBySha = new Map<string, string>();
  const shas = evidenceShas(requirements);
  if (shas.length > 0) {
    try {
      const rows = await prisma.aiCommitDigest.findMany({ where: { projectId: project.id, sha: { in: shas }, authorLogin: { not: null } }, select: { sha: true, authorLogin: true } });
      for (const r of rows) if (r.authorLogin) loginBySha.set(r.sha, r.authorLogin);
    } catch {
      // No commit authors; the row simply shows "Not known."
    }
  }
  let headingAuthors: ContributorLookup["headingAuthors"];
  if (hasHeadingProof(requirements)) {
    try {
      const { pieces, spans } = await loadGroupDocEvidence(project.id);
      headingAuthors = (heading) => headingAuthorIds(heading, pieces, spans);
    } catch {
      // Unreadable document: heading proof shows no names.
    }
  }
  return { names, userByLogin, loginBySha, headingAuthors };
}

// What a student (group leader or plain member) may receive, built key by key from the full answer. Anything
// not named here is dropped, so a field added to the instructor's answer later cannot reach a student by accident.
// Not sent to students, ever: status, errorCode, retryAt, aiLimit, upToDate, aiAddressed, briefFailed,
// hasInstructions, brief sources, githubUsername, prompt version, model, scores, shares, flags.
const STUDENT_BRIEF_REQ_KEYS = ["key", "text", "state", "sourceQuote", "sourceFile", "sourcePage", "contributors", "evidence"] as const;
function pick<T extends object>(o: T, keys: readonly string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if ((o as Record<string, unknown>)[k] !== undefined) out[k] = (o as Record<string, unknown>)[k];
  return out as Partial<T>;
}
export function studentReviewView(full: Record<string, unknown>, viewer: AiViewer = "member"): Record<string, unknown> {
  const out: Record<string, unknown> = pick(full, ["enabled", "repoUrl", "running", "hasReport", "generatedAt", "basedOnReportAt", "outdated", "summaries"]);
  out.canGenerate = false;
  const check = full.briefCheck as AiBriefView | undefined;
  if (check) {
    out.briefCheck = {
      ...pick(check, ["nothingFound", "nothingRead", "generatedAt", "outdated"]),
      requirements: check.requirements.map((r) => pick(r, STUDENT_BRIEF_REQ_KEYS)),
    };
  }
  const rf = full.refreshFailed as { findings?: AiRefreshNote; brief?: AiRefreshNote } | undefined;
  // Only the leader is told a refresh failed (as before), and only with dates: no error code, no reset time.
  if (rf && viewer === "leader") {
    out.refreshFailed = {
      ...(rf.findings ? { findings: pick(rf.findings, ["at", "shownFrom"]) } : {}),
      ...(rf.brief ? { brief: pick(rf.brief, ["at", "shownFrom"]) } : {}),
    };
  }
  return out;
}

function sendReview(res: import("express").Response, viewer: AiViewer, full: Record<string, unknown>) {
  res.json(viewer === "instructor" ? full : studentReviewView(full, viewer));
}

// GET /api/groups/:id/ai-review - the stored AI review of the group's work, shaped for the caller.
// Never calls Gemini. `{ enabled: false }` when the server switch or the class switch is off.
aiReviewRouter.get("/api/groups/:id/ai-review", requireAuth, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const project = await loadGroupShared(id.data);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  const me =project.groupMemberships.find((m) => m.userId === req.user!.sub);
  const instructor = isInstructorOf(req, project);
  if (!me && !instructor) {
    res.status(403).json({ error: "You do not have access to this group." });
    return;
  }
  if (!aiReviewEnabled() || !(await classSwitchOn(project))) {
    res.json({ enabled: false });
    return;
  }

  const viewer: AiViewer = instructor ? "instructor" : me!.role === "LEADER" ? "leader" : "member";
  const latestReport = await prisma.report.findFirst({
    where: { projectId: project.id },
    orderBy: [...LATEST_REPORT_ORDER],
    select: { id: true, generatedAt: true },
  });
  const review = await prisma.aiReportReview.findFirst({
    where: { kind: "MEMBER_SUMMARIES", report: { projectId: project.id } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const repo = repoRefOf(project.repoUrl);
  const base = {
    enabled: true,
    // Where file evidence links to; the viewer already sees this group's repository.
    repoUrl: canonicalRepoUrl(repo),
    running: isReviewRunning(project.id),
    canGenerate: instructor && req.user!.role === "INSTRUCTOR",
    hasReport: !!latestReport,
  };
  // Brief check: instructor and leader only. Computed before the early return so it shows even if
  // the member summaries have not been written.
  let brief: { briefCheck?: AiBriefView; briefFailed?: boolean; hasInstructions?: boolean } = {};
  let briefAttempt: AiLastAttempt | undefined;
  let briefStored: { createdAt: Date } | null = null;
  {
    // The assignment (and so the attachments) is resolved from this group; no id comes from the client.
    const [assignment, briefRow] = await Promise.all([
      prisma.assignment.findFirst({ where: { projects: { some: { id: project.id } } }, select: { id: true, description: true } }),
      prisma.aiReportReview.findFirst({
        where: { kind: "BRIEF_COMPARISON", report: { projectId: project.id } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ]);
    briefAttempt = (briefRow?.content as { lastAttempt?: AiLastAttempt } | null)?.lastAttempt;
    briefStored = briefRow;
    const text = assignment?.description ?? "";
    const attachments = assignment ? (await attachmentMetaFor([assignment.id])).get(assignment.id) ?? [] : [];
    // "Worked on by" names: instructor and leader only. A plain member gets no author information at all.
    const who = viewer === "member" ? undefined : await contributorLookup(project, (briefRow?.content as AiBriefContent | null)?.requirements ?? []);
    // Requirements the owning instructor confirmed (current marks only; a leader's claim never counts).
    const confirmed = new Set<string>();
    if (viewer !== "instructor" && briefRow) {
      const reqKeys = new Set(requirementKeys(((briefRow.content as AiBriefContent | null)?.requirements ?? []) as never).filter((k): k is string => !!k));
      const current = { description: text, attachmentNames: attachments.map((a) => (a as { filename?: string }).filename ?? "") };
      const marks = await prisma.requirementMark.findMany({
        where: { projectId: project.id, role: "INSTRUCTOR", status: "INSTRUCTOR_CONFIRMED" },
        select: { requirementKey: true, sourceQuote: true, sourceFile: true },
      });
      for (const m of marks) if (reqKeys.has(m.requirementKey) && !isMarkStale(m, current)) confirmed.add(m.requirementKey);
    }
    const view = shapeBriefForViewer(
      briefRow, viewer, req.user!.sub, { brief: text, attachments, latestReportId: latestReport?.id ?? null }, repo, who, confirmed,
    );
    if (view) brief.briefCheck = view;
    const hasInstructions = !!text.trim() || attachments.length > 0;
    if (viewer === "instructor" && briefRow?.status === "FAILED" && hasInstructions) brief.briefFailed = true;
    // Lets the instructor's page say "no instructions added yet" exactly (a missing check can mean other things).
    if (viewer === "instructor") brief.hasInstructions = hasInstructions;
  }

  // The AI's daily limit, while it is still in force. The page words it in the viewer's own clock.
  const memberAttempt = (review?.content as { lastAttempt?: AiLastAttempt } | null)?.lastAttempt;
  const limit = viewer === "instructor" ? activeQuotaLimit([memberAttempt, briefAttempt]) : null;
  const aiLimit = limit ? { aiLimit: limit } : {};
  // "Already up to date": the last Regenerate found nothing changed and made no AI call (instructor only).
  const upToDateOutcome = viewer === "instructor" ? lastUpToDate(project.id) : null;
  const upToDate = upToDateOutcome ? { upToDate: upToDateOutcome } : {};
  // A failed refresh that left the previous good result in place: the page shows it with a small note.
  const findingsNote = refreshNote(memberAttempt, review?.createdAt);
  const briefNote = refreshNote(briefAttempt, briefStored?.createdAt);
  const refreshFailed = findingsNote || briefNote
    ? { refreshFailed: { ...(findingsNote ? { findings: findingsNote } : {}), ...(briefNote ? { brief: briefNote } : {}) } }
    : {};

  if (!review) {
    sendReview(res, viewer, { ...base, generatedAt: null, summaries: null, ...brief, ...aiLimit, ...refreshFailed, ...upToDate });
    return;
  }

  const people = new Map(project.groupMemberships.map((m) => [m.userId, { name: m.user.name, githubUsername: m.user.githubUsername ?? null }]));
  const shaped = shapeSummariesForViewer(review.content as unknown as AiMemberSummariesContent, viewer, req.user!.sub, people, repo);
  const basedOn = await prisma.report.findUnique({ where: { id: review.reportId }, select: { generatedAt: true } });
  sendReview(res, viewer, {
    ...base,
    generatedAt: review.createdAt.toISOString(),
    basedOnReportAt: basedOn?.generatedAt.toISOString() ?? null,
    // The analysis moved on (or the prompt changed) since this review was written.
    outdated: review.reportId !== latestReport?.id || review.promptVersion !== AI_REVIEW_PROMPT_VERSION,
    summaries: shaped.summaries,
    ...brief,
    ...aiLimit,
    ...refreshFailed,
    ...upToDate,
    ...(viewer === "instructor"
      ? { status: review.status, errorCode: review.errorCode, aiAddressed: shaped.aiAddressed }
      : {}),
  });
});

// POST /api/groups/:id/ai-review - the owning instructor starts a review of the latest report.
// Answers 202 at once; the work runs in the background and the page polls GET. Manual only.
aiReviewRouter.post("/api/groups/:id/ai-review", ...requireRole("INSTRUCTOR"), requireVerifiedEmail, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const project = await loadGroup(id.data);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  if (!isInstructorOf(req, project)) {
    res.status(403).json({ error: "You do not have access to this group." });
    return;
  }
  if (!aiReviewEnabled()) {
    res.status(409).json({ code: "AI_REVIEW_DISABLED", error: "AI review is not turned on." });
    return;
  }
  if (!(await classSwitchOn(project))) {
    res.status(409).json({ code: "AI_REVIEW_OFF_FOR_CLASS", error: "AI review is turned off for this class." });
    return;
  }
  const hasReport = await prisma.report.count({ where: { projectId: project.id } });
  if (hasReport === 0) {
    res.status(409).json({ code: "NO_REPORT", error: "Analyze this group first." });
    return;
  }
  const started = startReview(project.id, async () => {
    // Two independent parts; one failing never stops the other.
    let reusedParts = 0;
    let otherParts = 0;
    let since = "";
    for (const part of [generateMemberSummaries, generateBriefComparison]) {
      try {
        const out = await part(project.id);
        if (out?.result.reused) {
          reusedParts++;
          if (out.result.reused.since > since) since = out.result.reused.since;
        } else if (out && out.result.status !== "SKIPPED") otherParts++;
      } catch (err) {
        otherParts++;
        console.error(`[ai-review] group ${project.id} ${part.name} failed:`, err);
      }
    }
    // Every part that exists was reused: no AI call was made, and the page can say nothing changed.
    if (reusedParts > 0 && otherParts === 0) recordUpToDate(project.id, since);
  });
  if (!started) {
    res.status(409).json({ code: "REVIEW_IN_PROGRESS", error: "A review of this group is already running." });
    return;
  }
  res.status(202).json({ running: true });
});
