import { prisma } from "../prisma.js";
import { checkRepoUrl } from "@shared/repoUrl.js";
import { LATEST_REPORT_ORDER } from "../latestReport.js";
import { buildPseudonymEntries, scrubFreeText } from "../geminiPseudonyms.js";
import { generateJson, AiReviewError, modelName } from "../geminiClient.js";
import type { AiBriefContent, AiReviewStatus } from "@shared/aiReviewTypes.js";
import { loadGroupDocEvidence } from "./docsEvidence.js";
import { fetchRepoTree, fetchRepoFileText } from "./repoFiles.js";
import { sanitizeForAi } from "./sanitize.js";
import { redactSecrets } from "./redact.js";
import { BRIEF_PROMPT_VERSION, BRIEF_SCHEMA, BRIEF_SYSTEM, dataBlock, validateBriefOutput } from "./prompts.js";
import {
  KEY_FILE_CHARS, briefHash, buildDocSections, fitBriefInput, selectKeyFiles, selectTreePaths, verifyRequirements,
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
}

const defaultDeps = (): BriefDeps => ({
  fetchTree: fetchRepoTree,
  fetchFile: fetchRepoFileText,
  loadDocs: loadGroupDocEvidence,
  generate: generateJson,
  githubToken: process.env.GITHUB_TOKEN,
});

export interface BriefResult extends ReviewResult<AiBriefContent> {
  briefHash: string | null;
}

export async function runBriefComparison(projectId: number, deps: BriefDeps = defaultDeps()): Promise<BriefResult> {
  const empty = (status: AiReviewStatus, errorCode: string | null = null, hash: string | null = null): BriefResult => ({
    status, errorCode, briefHash: hash, content: { requirements: [], aiAddressedCount: 0 },
  });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assignment: { select: { description: true, sourceType: true } },
      groupMemberships: { orderBy: { userId: "asc" }, include: { user: { select: { name: true, githubUsername: true } } } },
    },
  });
  const brief = (project?.assignment?.description ?? "").trim();
  if (!project || !brief) return empty("SKIPPED");
  const hash = briefHash(brief);

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
        const digests = await prisma.aiCommitDigest.findMany({ where: { projectId }, select: { files: true } });
        const added = new Map<string, number>();
        for (const d of digests) {
          for (const f of d.files as Array<{ path: string; added: number }>) added.set(f.path, (added.get(f.path) ?? 0) + f.added);
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
  if (sources > 0 && sourcesFailed === sources) return empty("FAILED", errors[0] ?? null, hash);

  const briefText = scrubFreeText(redactSecrets(brief), entries);
  const input = fitBriefInput({ brief: briefText, paths, files, docs });
  for (const f of input.files) fileText.set(f.path, f.excerpt);

  let raw;
  try {
    raw = await deps.generate({
      system: BRIEF_SYSTEM,
      prompt: dataBlock(input),
      schema: BRIEF_SCHEMA as unknown as Record<string, unknown>,
      validate: validateBriefOutput,
    });
  } catch (err) {
    return empty("FAILED", err instanceof AiReviewError ? err.code : "AI_UNAVAILABLE", hash);
  }

  const requirements = verifyRequirements(raw, { paths: new Set(input.paths), fileText, docs: input.docs, pieces, spans });
  return {
    status: errors.length > 0 ? "PARTIAL" : "OK",
    errorCode: errors[0] ?? null,
    briefHash: hash,
    content: { requirements, aiAddressedCount: injected },
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
