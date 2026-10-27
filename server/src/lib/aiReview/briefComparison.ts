import { prisma } from "../prisma.js";
import { checkRepoUrl } from "@shared/repoUrl.js";
import { attachmentMetaFor, loadBriefFilesForAi } from "../briefAttachments.js";
import { LATEST_REPORT_ORDER } from "../latestReport.js";
import { buildPseudonymEntries, scrubFreeText } from "../geminiPseudonyms.js";
import { generateJson, AiReviewError, modelName } from "../geminiClient.js";
import type { AiBriefContent, AiBriefSources, AiReviewStatus } from "@shared/aiReviewTypes.js";
import { loadGroupDocEvidence } from "./docsEvidence.js";
import { fetchRepoTree, fetchRepoFileText } from "./repoFiles.js";
import { fetchRepoCommitMessages } from "../githubCommitMessages.js";
import { COMMIT_PAGES } from "./memberSummaries.js";
import { sanitizeForAi } from "./sanitize.js";
import { redactSecrets } from "./redact.js";
import { BRIEF_PROMPT_VERSION, BRIEF_SCHEMA, BRIEF_SYSTEM, NO_WRITTEN_BRIEF, dataBlock, validateBriefOutput } from "./prompts.js";
import {
  KEY_FILE_CHARS, briefFingerprint, buildDocSections, fitBriefInput, logProofCheck, selectKeyFiles, selectTreePaths, verifyRequirements,
  type BriefInput,
} from "./briefEvidence.js";
import type { ReviewResult } from "./memberSummaries.js";

// Feature B: each requirement of the instructor's brief marked Found / Partly found / Not found, with
// quoted evidence (file path or Docs heading). Presence only: no quality judgement, no score. Nothing
// here is read by scoring.

export interface BriefDeps {
  fetchTree: typeof fetchRepoTree;
  fetchFile: typeof fetchRepoFileText;
  loadDocs: typeof loadGroupDocEvidence;
  generate: typeof generateJson;
  githubToken: string | undefined;
  // Only used to order the commits behind file links (newest first); optional and best effort.
  listCommits?: typeof fetchRepoCommitMessages;
  // The brief's attached PDF/images for an assignment. Defaults to the database; tests inject their own.
  loadBriefFiles?: typeof loadBriefFilesForAi;
}

const defaultDeps = (): BriefDeps => ({
  fetchTree: fetchRepoTree,
  fetchFile: fetchRepoFileText,
  loadDocs: loadGroupDocEvidence,
  generate: generateJson,
  githubToken: process.env.GITHUB_TOKEN,
  listCommits: fetchRepoCommitMessages,
});

export interface BriefResult extends ReviewResult<AiBriefContent> {
  briefHash: string | null;
}

// sha -> commit time (ms) for the newest commits; empty when GitHub cannot be read (links then fall back
// to the order the digests were written in).
async function commitTimes(deps: BriefDeps, owner: string, repo: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!deps.listCommits || !deps.githubToken) return out;
  try {
    for (const c of await deps.listCommits(owner, repo, deps.githubToken, COMMIT_PAGES)) out.set(c.sha, Date.parse(c.committedAt) || 0);
  } catch {
    // Order is a nicety; the check itself does not depend on it.
  }
  return out;
}

export async function runBriefComparison(projectId: number, deps: BriefDeps = defaultDeps()): Promise<BriefResult> {
  const empty = (
    status: AiReviewStatus, errorCode: string | null = null, hash: string | null = null, sources?: AiBriefSources,
  ): BriefResult => ({
    status, errorCode, briefHash: hash, content: { requirements: [], aiAddressedCount: 0, ...(sources ? { sources } : {}) },
  });

  // The assignment, and so its attachments, always come from the group being reviewed.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assignment: { select: { id: true, description: true, sourceType: true } },
      groupMemberships: { orderBy: { userId: "asc" }, include: { user: { select: { name: true, githubUsername: true } } } },
    },
  });
  const brief = (project?.assignment?.description ?? "").trim();
  const assignmentId = project?.assignment?.id;
  // Metadata of every attachment (for the fingerprint, skipped ones included); bytes only for the ones read.
  const attachmentMeta = assignmentId ? (await attachmentMetaFor([assignmentId])).get(assignmentId) ?? [] : [];
  const briefFiles = assignmentId && attachmentMeta.length > 0
    ? await (deps.loadBriefFiles ?? loadBriefFilesForAi)(assignmentId)
    : { usable: [], skipped: [] };
  if (!project) return empty("SKIPPED");
  const hash = briefFingerprint(brief, attachmentMeta);
  if (!brief && briefFiles.usable.length === 0) {
    // Nothing at all was added: stay hidden. Files were added but none could be read: no AI call, but keep
    // the reasons so the page can say why nothing was checked.
    if (briefFiles.skipped.length === 0) return empty("SKIPPED");
    return empty("SKIPPED", "BRIEF_NOTHING_READ", hash, { writtenBrief: false, filesRead: 0, skipped: briefFiles.skipped });
  }
  let briefSources: AiBriefSources = { writtenBrief: !!brief, filesRead: briefFiles.usable.length, skipped: briefFiles.skipped };

  const sourceType = project.assignment?.sourceType ?? "GITHUB";
  const entries = buildPseudonymEntries(
    project.groupMemberships.map((m) => ({ studentName: m.user.name, githubUsername: m.user.githubUsername ?? "" })) as never,
  );
  let injected = 0;
  const clean = (text: string) => {
    const s = sanitizeForAi(text, entries);
    injected += s.injected;
    return s.text;
  };

  const errors: string[] = [];
  let sources = 0;
  let sourcesFailed = 0;

  // Code: file list and a few key files.
  let paths: string[] = [];
  const fileText = new Map<string, string>();
  const files: BriefInput["files"] = [];
  // path -> shas of the commits that touched it, newest first. Display only (links); never sent to the AI.
  const commitsByPath = new Map<string, string[]>();
  const repo = project.repoUrl ? checkRepoUrl(project.repoUrl) : null;
  if (sourceType !== "EDITOR" && repo?.ok) {
    sources++;
    if (!deps.githubToken) {
      sourcesFailed++;
      errors.push("GITHUB_UNAVAILABLE");
    } else {
      try {
        const tree = await deps.fetchTree(repo.owner, repo.repo, deps.githubToken);
        paths = selectTreePaths(tree);
        const digests = await prisma.aiCommitDigest.findMany({
          where: { projectId },
          select: { sha: true, files: true, createdAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        const committedAt = await commitTimes(deps, repo.owner, repo.repo);
        const newestFirst = [...digests].sort(
          (a, b) => (committedAt.get(b.sha) ?? 0) - (committedAt.get(a.sha) ?? 0),
        );
        const added = new Map<string, number>();
        for (const d of newestFirst) {
          for (const f of d.files as Array<{ path: string; added: number }>) {
            added.set(f.path, (added.get(f.path) ?? 0) + f.added);
            const list = commitsByPath.get(f.path) ?? [];
            if (!list.includes(d.sha)) list.push(d.sha);
            commitsByPath.set(f.path, list);
          }
        }
        for (const path of selectKeyFiles(paths, added)) {
          try {
            const text = await deps.fetchFile(repo.owner, repo.repo, deps.githubToken, path);
            if (text === null) continue;
            const excerpt = clean(redactSecrets(text.slice(0, KEY_FILE_CHARS)));
            files.push({ path, excerpt });
            fileText.set(path, excerpt);
          } catch {
            // One unreadable file is not a failure of the whole check.
          }
        }
      } catch {
        sourcesFailed++;
        errors.push("GITHUB_UNAVAILABLE");
      }
    }
  }

  // Docs: the whole document, sections shortened to a budget.
  let docs = [] as BriefInput["docs"];
  let pieces = [] as Awaited<ReturnType<BriefDeps["loadDocs"]>>["pieces"];
  let spans = [] as Awaited<ReturnType<BriefDeps["loadDocs"]>>["spans"];
  if (sourceType !== "GITHUB") {
    sources++;
    try {
      const ev = await deps.loadDocs(projectId);
      pieces = ev.pieces;
      spans = ev.spans;
      docs = buildDocSections(ev.pieces).map((d) => ({ heading: clean(d.heading), text: clean(d.text) }));
    } catch {
      sourcesFailed++;
      errors.push("DOCS_UNAVAILABLE");
    }
  }

  // Every source that was expected failed: say so instead of reporting "nothing found".
  if (sources > 0 && sourcesFailed === sources) return empty("FAILED", errors[0] ?? null, hash, briefSources);

  const briefText = brief ? scrubFreeText(redactSecrets(brief), entries) : NO_WRITTEN_BRIEF;
  const input = fitBriefInput({ brief: briefText, paths, files, docs });
  for (const f of input.files) fileText.set(f.path, f.excerpt);

  // The names of the attached files go in the DATA block so the AI can name one as a requirement's source.
  const ask = (attached: typeof briefFiles.usable) =>
    deps.generate({
      system: BRIEF_SYSTEM,
      prompt: dataBlock(attached.length > 0 ? { ...input, attachedFiles: attached.map((f) => f.filename) } : input),
      schema: BRIEF_SCHEMA as unknown as Record<string, unknown>,
      validate: validateBriefOutput,
      ...(attached.length > 0 ? { files: attached.map((f) => ({ mimeType: f.mimeType, data: f.data })) } : {}),
    });

  let raw;
  let sentFiles = briefFiles.usable;
  try {
    raw = await ask(briefFiles.usable);
  } catch (err) {
    if (!(err instanceof AiReviewError && err.code === "AI_BAD_INPUT" && briefFiles.usable.length > 0)) {
      return empty("FAILED", err instanceof AiReviewError ? err.code : "AI_UNAVAILABLE", hash, briefSources);
    }
    // Gemini could not read the attachments and does not say which one: try again on the written brief
    // alone, and say that every attached file could not be read.
    briefSources = {
      writtenBrief: !!brief,
      filesRead: 0,
      skipped: [...briefFiles.skipped, ...briefFiles.usable.map((f) => ({ filename: f.filename, reason: "UNREADABLE" as const }))],
    };
    errors.push("AI_BAD_INPUT");
    if (!brief) return empty("FAILED", "AI_BAD_INPUT", hash, briefSources);
    sentFiles = [];
    try {
      raw = await ask([]);
    } catch (err2) {
      return empty("FAILED", err2 instanceof AiReviewError ? err2.code : "AI_UNAVAILABLE", hash, briefSources);
    }
  }

  // A requirement may point only to the written instructions that were sent and to files that were sent.
  const verified = verifyRequirements(raw, {
    source: { instructions: brief ? input.brief : "", files: sentFiles.map((f) => f.filename) },
    paths: new Set(input.paths), fileText, docs: input.docs, pieces, spans,
  });
  logProofCheck(`brief (group ${projectId})`, verified.proof);
  briefSources = { ...briefSources, droppedCount: verified.droppedCount };
  // The AI answered but every requirement lacked a confirmable source: report a failure rather than hide the card.
  if (verified.requirements.length === 0 && verified.droppedCount > 0) {
    return empty("FAILED", "AI_BAD_OUTPUT", hash, briefSources);
  }
  const requirements = verified.requirements.map((r) => ({
    ...r,
    evidence: r.evidence.map((e) => (e.type === "file" && commitsByPath.has(e.ref) ? { ...e, commits: commitsByPath.get(e.ref)!.slice(0, 6) } : e)),
  }));
  return {
    status: errors.length > 0 ? "PARTIAL" : "OK",
    errorCode: errors[0] ?? null,
    briefHash: hash,
    content: { requirements, aiAddressedCount: injected, sources: briefSources },
  };
}

export async function generateBriefComparison(projectId: number, deps?: BriefDeps): Promise<{ reportId: number; result: BriefResult } | null> {
  const report = await prisma.report.findFirst({ where: { projectId }, orderBy: [...LATEST_REPORT_ORDER], select: { id: true } });
  if (!report) return null;
  const result = await runBriefComparison(projectId, deps);
  const data = {
    status: result.status,
    promptVersion: BRIEF_PROMPT_VERSION,
    model: modelName(),
    briefHash: result.briefHash,
    content: result.content as object,
    errorCode: result.errorCode,
  };
  await prisma.aiReportReview.upsert({
    where: { reportId_kind: { reportId: report.id, kind: "BRIEF_COMPARISON" } },
    create: { reportId: report.id, kind: "BRIEF_COMPARISON", ...data },
    update: { ...data, createdAt: new Date() },
  });
  return { reportId: report.id, result };
}
