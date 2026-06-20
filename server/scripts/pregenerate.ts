/**
 * pregenerate.ts
 *
 * Run once before a demo to fetch GitHub data, compute scores, and generate
 * AI narratives for every seeded project. Saves everything to the database so
 * the live demo shows results instantly with zero API calls.
 *
 * Usage:
 *   npm run pregenerate -w server        (from repo root)
 *   npm run pregenerate                  (from server/)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { fetchRepoStats } from "../src/lib/github.js";
import { computeTeamReport } from "@shared/scoring.js";
import { generateFairnessNarrative } from "../src/lib/gemini.js";
import type { RawMemberStats, TeamReport } from "@shared/types.js";

const prisma = new PrismaClient();

async function main() {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.error("[FATAL] GITHUB_TOKEN is not set in server/.env");
    process.exit(1);
  }

  const projects = await prisma.project.findMany({ include: { members: true } });
  if (projects.length === 0) {
    console.log("No projects found. Run 'npm run db:seed -w server' first.");
    return;
  }

  console.log(`Found ${projects.length} project(s). Starting pre-generation…\n`);

  for (const project of projects) {
    console.log(`▸ ${project.name} (${project.repoUrl})`);

    // ── 1. Fetch GitHub data ──────────────────────────────────────────────
    let rawData: Awaited<ReturnType<typeof fetchRepoStats>>;
    try {
      rawData = await fetchRepoStats(project.repoUrl, githubToken);
    } catch (err) {
      console.error(`  ✗ GitHub fetch failed: ${(err as { message?: string }).message ?? String(err)}`);
      continue;
    }

    // ── 2. Build raw members + score ─────────────────────────────────────
    const contributorMap = new Map(
      rawData.contributors.map((c) => [c.githubUsername.toLowerCase(), c])
    );

    const rawMembers: RawMemberStats[] = project.members.map((m) => {
      const c = contributorMap.get(m.githubUsername.toLowerCase());
      return {
        studentName:           m.studentName,
        githubUsername:        m.githubUsername,
        commits:               c?.commits               ?? 0,
        additions:             c?.additions             ?? 0,
        deletions:             c?.deletions             ?? 0,
        commitDates:           c?.commitDates           ?? [],
        codeLinesAdded:        c?.codeLinesAdded        ?? 0,
        commentLinesAdded:     c?.commentLinesAdded     ?? 0,
        blankLinesAdded:       c?.blankLinesAdded       ?? 0,
        weightedAdditions:     c?.weightedAdditions     ?? 0,
        selfChurnRatio:        c?.selfChurnRatio        ?? 0,
        commitImpactBreakdown: c?.commitImpactBreakdown ?? { structural: 0, functional: 0, cosmetic: 0, trivial: 0 },
        fileTypeBreakdown:     c?.fileTypeBreakdown     ?? { source: 0, test: 0, docs: 0, style: 0, config: 0, other: 0 },
      };
    });

    const report = computeTeamReport(rawMembers);
    console.log(`  ✓ Scored (Gini ${report.gini.toFixed(3)}, ${report.teamHealth})`);

    // ── 3. Generate narrative ─────────────────────────────────────────────
    let narrative: string;
    try {
      narrative = await generateFairnessNarrative(project.name, report);
      console.log(`  ✓ Narrative generated (${narrative.length} chars)`);
    } catch (err) {
      console.error(`  ✗ Gemini failed: ${(err as { message?: string }).message ?? String(err)}`);
      continue;
    }

    // ── 4. Upsert report row ──────────────────────────────────────────────
    const content = JSON.stringify({ report, narrative } satisfies { report: TeamReport; narrative: string });
    const existing = await prisma.report.findFirst({
      where: { projectId: project.id },
      orderBy: { generatedAt: "desc" },
    });

    if (existing) {
      await prisma.report.update({
        where: { id: existing.id },
        data: { generatedAt: new Date(), gini: report.gini, teamHealth: report.teamHealth, content },
      });
      console.log(`  ✓ Report updated (id ${existing.id})`);
    } else {
      const created = await prisma.report.create({
        data: { projectId: project.id, gini: report.gini, teamHealth: report.teamHealth, content },
      });
      console.log(`  ✓ Report created (id ${created.id})`);
    }

    console.log();
  }

  await prisma.$disconnect();
  console.log("Pre-generation complete. Demo is ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
