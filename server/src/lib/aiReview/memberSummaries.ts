import { prisma } from "../prisma.js";
import { checkRepoUrl } from "@shared/repoUrl.js";
import { LATEST_REPORT_ORDER } from "../latestReport.js";
import { buildPseudonymEntries } from "../geminiPseudonyms.js";
import { fetchRepoCommitMessages } from "../githubCommitMessages.js";
import { generateJson, AiReviewError, modelName } from "../geminiClient.js";
import type { AiMemberSummariesContent, AiMemberSummary, AiAddressedNote, AiReviewStatus } from "@shared/aiReviewTypes.js";
import { fetchCommitEvidence, MAX_REMOVED_LINES_PER_FILE, type CommitEvidence } from "./commitEvidence.js";
import { loadGroupDocEvidence, memberDocEvidence } from "./docsEvidence.js";
import { sanitizeForAi } from "./sanitize.js";
import { redactSecrets } from "./redact.js";
import { checkTone } from "./toneGuard.js";
import { factsSummary, mergeFiles, NO_ACTIVITY_LINE } from "./facts.js";
import { logReadability } from "./readability.js";
import {
  AI_REVIEW_PROMPT_VERSION,
  COMMIT_PROMPT_VERSION,
  COMMIT_SCHEMA,
  COMMIT_SYSTEM,
  ROLLUP_SCHEMA,
  ROLLUP_SYSTEM,
  STRICTER_REMINDER,
  dataBlock,
  validateCommitOutput,
  validateRollupOutput,
} from "./prompts.js";

// Feature A: 1-2 neutral sentences per member from their commits and their Docs text.
// Stage 1 judges each commit once (cached per group, sha and prompt version); stage 2 writes one
// call's worth of member summaries. Nothing here is read by scoring.

export const COMMITS_PER_MEMBER = 15;
export const COMMIT_PAGES = 3;
export const COMMIT_BATCH_SIZE = 6;
export const COMMIT_BATCH_MAX_CHARS = 24_000;
export const DIGEST_MAX_CHARS = 240;

export interface MemberSummaryDeps {
  listCommits: typeof fetchRepoCommitMessages;
  fetchEvidence: typeof fetchCommitEvidence;
  loadDocs: typeof loadGroupDocEvidence;
  generate: typeof generateJson;
  githubToken: string | undefined;
}

const defaultDeps = (): MemberSummaryDeps => ({
  listCommits: fetchRepoCommitMessages,
  fetchEvidence: fetchCommitEvidence,
  loadDocs: loadGroupDocEvidence,
  generate: generateJson,
  githubToken: process.env.GITHUB_TOKEN,
});

export interface ReviewResult<C> {
  status: AiReviewStatus;
  errorCode: string | null;
  content: C;
}

interface DigestLine {
  sha: string;
  summary: string;
  files: Array<{ path: string; added: number; removed: number }>;
}

function fitBatchPayload(evidence: CommitEvidence[], sanitize: (t: string, sha: string) => string) {
  const build = (maxLines: number) =>
    evidence.map((e) => ({
      sha: e.sha,
      message: sanitize(e.message, e.sha),
      files: e.files.map((f) => ({
        path: f.path,
        added: f.added,
        removed: f.removed,
        addedLines: f.addedLines.slice(0, maxLines).map((l) => sanitize(l, e.sha)),
        // Only present for a file that lost more lines than it gained; shrinks with the added lines.
        ...(f.removedLines.length > 0
          ? { removedLines: f.removedLines.slice(0, Math.min(maxLines, MAX_REMOVED_LINES_PER_FILE)).map((l) => sanitize(l, e.sha)) }
          : {}),
      })),
    }));
  for (const maxLines of [40, 15, 5, 0]) {
    const payload = build(maxLines);
    if (JSON.stringify(payload).length <= COMMIT_BATCH_MAX_CHARS || maxLines === 0) return payload;
  }
  return build(0);
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function runMemberSummaries(
  projectId: number,
  deps: MemberSummaryDeps = defaultDeps(),
): Promise<ReviewResult<AiMemberSummariesContent>> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assignment: { select: { sourceType: true } },
      groupMemberships: {
        orderBy: { userId: "asc" },
        include: { user: { select: { id: true, name: true, githubUsername: true } } },
      },
    },
  });
  if (!project) return { status: "SKIPPED", errorCode: null, content: { members: [], aiAddressed: [] } };

  const sourceType = project.assignment?.sourceType ?? "GITHUB";
  const usesGithub = sourceType !== "EDITOR";
  const usesDocs = sourceType !== "GITHUB";

  const people = project.groupMemberships.map((m) => ({
    userId: m.userId,
    studentName: m.user.name,
    githubUsername: m.user.githubUsername ?? "",
  }));
  const entries = buildPseudonymEntries(people as never);
  const label = new Map(people.map((p, i) => [p.userId, entries[i]!.pseudonym]));
  const byLogin = new Map(
    people.filter((p) => p.githubUsername).map((p) => [p.githubUsername.toLowerCase(), p.userId]),
  );

  const errors: string[] = [];
  const addressed = new Map<string, AiAddressedNote>();
  const noteInjection = (userId: number, where: "commits" | "docs", count: number) => {
    if (count <= 0) return;
    const key = `${userId}:${where}`;
    const cur = addressed.get(key) ?? { userId, where, count: 0 };
    cur.count += count;
    addressed.set(key, cur);
  };

  // ── Stage 1: commits ──────────────────────────────────────────────────────
  const lines = new Map<number, DigestLine[]>(); // userId -> newest first
  const otherCommits = new Map<number, number>();

  const repo = project.repoUrl ? checkRepoUrl(project.repoUrl) : null;
  if (usesGithub && repo?.ok && deps.githubToken) {
    try {
      const all = await deps.listCommits(repo.owner, repo.repo, deps.githubToken, COMMIT_PAGES);
      const picked = new Map<number, Array<{ sha: string; authorLogin: string }>>();
      for (const c of all) {
        const userId = c.authorLogin ? byLogin.get(c.authorLogin.toLowerCase()) : undefined;
        if (userId === undefined) continue;
        const list = picked.get(userId) ?? [];
        list.push({ sha: c.sha, authorLogin: c.authorLogin! });
        picked.set(userId, list);
      }
      for (const [userId, list] of picked) otherCommits.set(userId, Math.max(0, list.length - COMMITS_PER_MEMBER));
      const selected = [...picked.entries()].map(([userId, list]) => ({ userId, list: list.slice(0, COMMITS_PER_MEMBER) }));
      const shas = selected.flatMap((s) => s.list.map((c) => c.sha));

      const cached = await prisma.aiCommitDigest.findMany({
        where: { projectId, promptVersion: COMMIT_PROMPT_VERSION, sha: { in: shas } },
      });
      const digestBySha = new Map<string, DigestLine>(
        cached.map((d) => [d.sha, { sha: d.sha, summary: d.summary, files: d.files as DigestLine["files"] }]),
      );

      const missing = selected.flatMap((s) => s.list.filter((c) => !digestBySha.has(c.sha)).map((c) => ({ ...c, userId: s.userId })));
      const evidence: Array<CommitEvidence & { userId: number }> = [];
      for (const m of missing) {
        try {
          evidence.push({ ...(await deps.fetchEvidence(repo.owner, repo.repo, deps.githubToken, m.sha)), userId: m.userId });
        } catch {
          errors.push("GITHUB_UNAVAILABLE");
        }
      }

      for (const batch of chunk(evidence, COMMIT_BATCH_SIZE)) {
        const authorOf = new Map(batch.map((e) => [e.sha, e.userId]));
        const payload = fitBatchPayload(batch, (text, sha) => {
          const s = sanitizeForAi(text, entries);
          noteInjection(authorOf.get(sha)!, "commits", s.injected);
          return s.text;
        });
        let said = new Map<string, string>();
        try {
          const out = await deps.generate({
            system: COMMIT_SYSTEM,
            prompt: dataBlock({ commits: payload }),
            schema: COMMIT_SCHEMA as unknown as Record<string, unknown>,
            validate: validateCommitOutput,
          });
          said = new Map(out.map((c) => [c.sha, c.summary]));
        } catch (err) {
          errors.push(err instanceof AiReviewError ? err.code : "AI_UNAVAILABLE");
        }
        const toStore: Array<{ projectId: number; sha: string; promptVersion: string; model: string; authorLogin: string | null; summary: string; files: DigestLine["files"] }> = [];
        for (const e of batch) {
          const files = e.files.map((f) => ({ path: f.path, added: f.added, removed: f.removed }));
          const text = redactSecrets(said.get(e.sha) ?? "");
          const usable = text !== "" && text.length <= DIGEST_MAX_CHARS && checkTone(text).ok;
          if (usable) {
            toStore.push({ projectId, sha: e.sha, promptVersion: COMMIT_PROMPT_VERSION, model: modelName(), authorLogin: e.authorLogin, summary: text, files });
            digestBySha.set(e.sha, { sha: e.sha, summary: text, files });
          } else {
            // Not stored, so the next Generate tries this commit again.
            const paths = files.slice(0, 3).map((f) => f.path).join(", ");
            digestBySha.set(e.sha, { sha: e.sha, summary: paths ? `Changed ${paths}.` : "Changed files.", files });
          }
        }
        if (toStore.length > 0) await prisma.aiCommitDigest.createMany({ data: toStore, skipDuplicates: true });
      }

      for (const s of selected) {
        lines.set(s.userId, s.list.map((c) => digestBySha.get(c.sha)).filter((d): d is DigestLine => !!d));
      }
    } catch {
      errors.push("GITHUB_UNAVAILABLE");
    }
  } else if (usesGithub && project.repoUrl && !deps.githubToken) {
    errors.push("GITHUB_UNAVAILABLE");
  }

  // ── Docs ──────────────────────────────────────────────────────────────────
  const docs = new Map<number, { headings: string[]; excerpt: string }>();
  if (usesDocs) {
    try {
      const ev = await deps.loadDocs(projectId);
      for (const p of people) {
        const mine = memberDocEvidence(ev.pieces, ev.spans, p.userId);
        if (mine.chars === 0) continue;
        const s = sanitizeForAi(mine.excerpt, entries);
        noteInjection(p.userId, "docs", s.injected);
        docs.set(p.userId, { headings: mine.headings, excerpt: s.text });
      }
    } catch {
      errors.push("DOCS_UNAVAILABLE");
    }
  }

  // ── Stage 2: one summary per member ───────────────────────────────────────
  const evidenceOf = (userId: number) => {
    const memberLines = lines.get(userId) ?? [];
    return {
      files: mergeFiles(memberLines.map((l) => ({ sha: l.sha, files: l.files }))),
      docSections: docs.get(userId)?.headings ?? [],
      commitCount: memberLines.length,
      otherCommits: otherCommits.get(userId) ?? 0,
      allFilesCount: mergeFiles(memberLines.map((l) => l.files), Number.POSITIVE_INFINITY).length,
    };
  };

  const withEvidence = people.filter((p) => (lines.get(p.userId)?.length ?? 0) > 0 || docs.has(p.userId));
  const written = new Map<number, string>();
  let rollupFailed = false;

  if (withEvidence.length > 0) {
    const payload = withEvidence.map((p) => ({
      member: label.get(p.userId)!,
      commits: (lines.get(p.userId) ?? []).map((l) => l.summary),
      olderCommitsNotShown: otherCommits.get(p.userId) ?? 0,
      docsText: docs.get(p.userId)?.excerpt ?? "",
    }));
    const ask = async (members: typeof payload, extra: string) =>
      deps.generate({
        system: extra ? `${ROLLUP_SYSTEM}\n${extra}` : ROLLUP_SYSTEM,
        prompt: dataBlock({ members }),
        schema: ROLLUP_SCHEMA as unknown as Record<string, unknown>,
        validate: validateRollupOutput,
      });
    const accept = (out: Array<{ member: string; summary: string }>, wanted: typeof payload) => {
      const rejected: typeof payload = [];
      for (const m of wanted) {
        const hit = out.find((o) => o.member === m.member);
        const text = redactSecrets(hit?.summary ?? "");
        const userId = withEvidence.find((p) => label.get(p.userId) === m.member)!.userId;
        if (text && checkTone(text).ok) written.set(userId, text);
        else rejected.push(m);
      }
      return rejected;
    };
    try {
      let rejected = accept(await ask(payload, ""), payload);
      if (rejected.length > 0) rejected = accept(await ask(rejected, STRICTER_REMINDER), rejected);
    } catch (err) {
      rollupFailed = true;
      errors.push(err instanceof AiReviewError ? err.code : "AI_UNAVAILABLE");
    }
  }

  const members: AiMemberSummary[] = people.map((p) => {
    const ev = evidenceOf(p.userId);
    const { allFilesCount, ...evidence } = ev;
    const text = written.get(p.userId);
    if (text) return { userId: p.userId, summary: text, source: "ai", evidence };
    const hasEvidence = ev.commitCount > 0 || ev.docSections.length > 0;
    return {
      userId: p.userId,
      summary: hasEvidence ? factsSummary(evidence, allFilesCount) : NO_ACTIVITY_LINE,
      source: "facts",
      evidence,
    };
  });

  // Log-only: how many of the sentences the AI wrote are long. Never changes what is shown.
  logReadability(`member findings (group ${projectId})`, members.filter((m) => m.source === "ai").map((m) => m.summary));

  const needed = withEvidence.length;
  const fromAi = withEvidence.filter((p) => written.has(p.userId)).length;
  let status: AiReviewStatus = "OK";
  if (needed > 0 && fromAi === 0 && (rollupFailed || errors.length > 0)) status = "FAILED";
  else if (errors.length > 0 || fromAi < needed) status = "PARTIAL";
  if (needed === 0 && errors.length === 0) status = "SKIPPED";

  return {
    status,
    errorCode: errors[0] ?? null,
    content: { members, aiAddressed: [...addressed.values()] },
  };
}

// Runs the review for a group's latest report and stores it (one row per report and kind).
export async function generateMemberSummaries(
  projectId: number,
  deps?: MemberSummaryDeps,
): Promise<{ reportId: number; result: ReviewResult<AiMemberSummariesContent> } | null> {
  const report = await prisma.report.findFirst({ where: { projectId }, orderBy: [...LATEST_REPORT_ORDER], select: { id: true } });
  if (!report) return null;
  const result = await runMemberSummaries(projectId, deps);
  const data = {
    status: result.status,
    promptVersion: AI_REVIEW_PROMPT_VERSION,
    model: modelName(),
    content: result.content as object,
    errorCode: result.errorCode,
  };
  await prisma.aiReportReview.upsert({
    where: { reportId_kind: { reportId: report.id, kind: "MEMBER_SUMMARIES" } },
    create: { reportId: report.id, kind: "MEMBER_SUMMARIES", ...data },
    update: { ...data, createdAt: new Date() },
  });
  return { reportId: report.id, result };
}
