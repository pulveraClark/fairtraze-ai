// Read-only. Lists assignments whose groups (Project rows) hold differing legacy scoring settings,
// i.e. the ones the assignment_scoring_config migration will reset to defaults.
// Run BEFORE migrating (the legacy Project columns are read, nothing is written):
//   cd server && npx tsx scripts/listScoringConflicts.ts   (DATABASE_URL pointing at the DB to inspect)
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const FIELDS = [
  "weightCommits", "weightLines", "weightActiveDays", "freeRiderThreshold",
  "overloadThreshold", "deadlineDrivenThreshold", "weightGithub", "weightDocs",
] as const;

const prisma = new PrismaClient();

async function main() {
  const groups = await prisma.project.findMany({
    where: { assignmentId: { not: null } },
    select: { id: true, groupName: true, assignmentId: true, ...Object.fromEntries(FIELDS.map((f) => [f, true])) },
    orderBy: { id: "asc" },
  });
  const byAssignment = new Map<number, typeof groups>();
  for (const g of groups) {
    const list = byAssignment.get(g.assignmentId!) ?? [];
    list.push(g);
    byAssignment.set(g.assignmentId!, list);
  }

  let conflicts = 0;
  for (const [assignmentId, list] of byAssignment) {
    const variants = new Map<string, number[]>();
    for (const g of list) {
      const key = FIELDS.map((f) => `${f}=${(g as unknown as Record<string, number>)[f]}`).join(" ");
      variants.set(key, [...(variants.get(key) ?? []), g.id]);
    }
    if (variants.size > 1) {
      conflicts++;
      console.log(`CONFLICT assignment ${assignmentId} (${list.length} groups):`);
      for (const [key, ids] of variants) console.log(`  groups ${ids.join(",")}: ${key}`);
    }
  }
  console.log(`\n${byAssignment.size} assignment(s) with groups, ${groups.length} group(s), ${conflicts} conflicting.`);
}

main().finally(() => prisma.$disconnect());
