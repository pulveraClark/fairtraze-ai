// Audits (and, only when told exactly what to remove, repairs) phantom whole-document INSERT events.
//
// Background: before the ready-before-sync fix (persistence.ts roomReady), a client that held the whole
// document and reconnected to a room whose restore was still in flight had all of it recorded as one
// INSERT credited to that user (staging group 86). The saved Yjs state is fine (the text is not
// duplicated); only the EditEvent log (and that user's EditSession) carries the phantom. Removing the
// event restores correct authorship; the Yjs state needs no fix.
//
// DRY RUN BY DEFAULT: nothing is written. For every document with a saved Yjs state it replays the
// EditEvent log and compares the replay's character count with the document's real text length, then
// lists whole-document INSERT candidates and whether removing each one reconciles the two.
//
//   cd server
//   npx tsx scripts/auditPhantomInserts.ts                         # audit every document
//   npx tsx scripts/auditPhantomInserts.ts --group 86              # one group (or --document <id>)
//   npx tsx scripts/auditPhantomInserts.ts --document 381 --apply --event-ids 5123 [--session-ids 77]
//
// --apply needs --document, explicit --event-ids (it never guesses), and refuses unless removing
// those events makes the replay match the document length (override: --allow-unreconciled). It prints
// the before and after sums, deletes in one transaction, then re-reads and prints the sums again.
// --session-ids (optional, explicit) deletes the matching EditSession rows; each must belong to the
// same document and to the same user as one of the removed events.
//
// The database is whatever DATABASE_URL points at (printed first). After repairing a group, run its
// analysis again so the stored report reflects the corrected log.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import type { EditEvent } from "@prisma/client";
import {
  findPhantomCandidates,
  plainTextLengthOf,
  summarizeEvents,
  type AuditSummary,
} from "../src/collab/authorshipAudit.js";

const prisma = new PrismaClient();

interface Args {
  apply: boolean;
  allowUnreconciled: boolean;
  documentId?: number;
  groupId?: number;
  eventIds: number[];
  sessionIds: number[];
}

function parseIds(value: string | undefined, flag: string): number[] {
  if (!value) throw new Error(`${flag} needs a comma-separated list of ids`);
  const ids = value.split(",").map((s) => Number(s.trim()));
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) throw new Error(`${flag}: invalid id list "${value}"`);
  return ids;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, allowUnreconciled: false, eventIds: [], sessionIds: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => argv[++i];
    if (a === "--apply") args.apply = true;
    else if (a === "--allow-unreconciled") args.allowUnreconciled = true;
    else if (a === "--document") args.documentId = Number(next());
    else if (a === "--group") args.groupId = Number(next());
    else if (a === "--event-ids") args.eventIds = parseIds(next(), a);
    else if (a === "--session-ids") args.sessionIds = parseIds(next(), a);
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (args.apply) {
    if (!args.documentId) throw new Error("--apply requires --document <id>");
    if (args.eventIds.length === 0) throw new Error("--apply requires explicit --event-ids <id,id,...>");
  } else if (args.eventIds.length || args.sessionIds.length) {
    throw new Error("--event-ids / --session-ids only apply together with --apply (the default is a dry run)");
  }
  return args;
}

function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host || "(unknown)";
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function printSums(label: string, s: AuditSummary, textLength: number, names: Map<number, string>) {
  console.log(`  ${label}:`);
  console.log(
    `    events=${s.eventCount}  SUM(INSERT)=${s.insertedTotal}  SUM(DELETE)=${s.deletedTotal}  net=${s.netTotal}` +
      `  replay slots=${s.slotCount}  document text=${textLength}  ${s.slotCount === textLength ? "OK" : `MISMATCH (${s.slotCount - textLength})`}`
  );
  const users = Object.entries(s.slotsByUser).map(([id, n]) => `${names.get(Number(id)) ?? "user"} #${id}: ${n}`);
  console.log(`    retained per user: ${users.length ? users.join(", ") : "(none)"}`);
}

async function userNames(ids: number[]): Promise<Map<number, string>> {
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, systemRole: true } });
  return new Map(users.map((u) => [u.id, `${u.name} (${u.systemRole})`]));
}

function describeEvent(e: EditEvent, names: Map<number, string>): string {
  const text = e.insertedText ? ` "${e.insertedText.slice(0, 40).replace(/\s+/g, " ")}${e.insertedText.length > 40 ? "..." : ""}"` : "";
  return `event #${e.id} ${e.eventType} pos=${e.position} len=${e.length} source=${e.source} by ${names.get(e.userId) ?? `user #${e.userId}`} at ${e.timestamp.toISOString()}${text}`;
}

async function audit(args: Args) {
  const docs = await prisma.document.findMany({
    where: {
      ...(args.documentId ? { id: args.documentId } : {}),
      ...(args.groupId ? { groupId: args.groupId } : {}),
    },
    select: { id: true, groupId: true, yjsState: true },
    orderBy: { id: "asc" },
  });

  let checked = 0;
  let mismatched = 0;
  let skipped = 0;
  for (const doc of docs) {
    if (!doc.yjsState) {
      skipped++;
      continue;
    }
    checked++;
    const events = await prisma.editEvent.findMany({ where: { documentId: doc.id }, orderBy: [{ timestamp: "asc" }, { id: "asc" }] });
    const textLength = plainTextLengthOf(doc.yjsState);
    const summary = summarizeEvents(events);
    if (summary.slotCount === textLength) continue;

    mismatched++;
    const names = await userNames([...new Set(events.map((e) => e.userId))]);
    const members = new Set(
      (await prisma.groupMembership.findMany({ where: { projectId: doc.groupId }, select: { userId: true } })).map((m) => m.userId)
    );
    console.log(`\nDocument ${doc.id} (group ${doc.groupId})`);
    printSums("as recorded", summary, textLength, names);

    const candidates = findPhantomCandidates(events, textLength);
    if (candidates.length === 0) {
      console.log("  no whole-document INSERT candidate; the drift has another cause (inspect the log by hand).");
    }
    if (candidates.filter((c) => c.reconciles).length > 1) {
      console.log(
        "  several candidates reconcile by count alone: the phantom is the one recorded AFTER the content already existed\n" +
          "  (the later one, usually by someone who did not write it). Check the timestamps and users before choosing."
      );
    }
    for (const c of candidates) {
      const who = members.has(c.event.userId) ? "GROUP MEMBER (their Docs share is inflated)" : "not a group member (no effect on shares)";
      console.log(`  candidate: ${describeEvent(c.event, names)}`);
      console.log(`    user is ${who}; removing it ${c.reconciles ? "RECONCILES the log" : "does NOT reconcile the log"}`);
      printSums(`    if event #${c.event.id} were removed`, c.without, textLength, names);
      const sessions = await prisma.editSession.findMany({
        where: { documentId: doc.id, userId: c.event.userId, startedAt: { lte: c.event.timestamp }, OR: [{ endedAt: null }, { endedAt: { gte: c.event.timestamp } }] },
        select: { id: true, startedAt: true, endedAt: true, characterCount: true, source: true },
      });
      for (const s of sessions) {
        console.log(`    session #${s.id} covers it: ${s.startedAt.toISOString()} .. ${s.endedAt?.toISOString() ?? "open"}, chars=${s.characterCount}, ${s.source}`);
      }
      if (c.reconciles) {
        console.log(
          `    fix: npx tsx scripts/auditPhantomInserts.ts --document ${doc.id} --apply --event-ids ${c.event.id}` +
            (sessions.length === 1 ? ` --session-ids ${sessions[0]!.id}` : "")
        );
      }
    }
  }
  console.log(`\n${checked} document(s) checked, ${mismatched} with a replay/text mismatch, ${skipped} skipped (no saved Yjs state).`);
  console.log("Dry run: nothing was written.");
}

async function apply(args: Args) {
  const doc = await prisma.document.findUnique({ where: { id: args.documentId! }, select: { id: true, groupId: true, yjsState: true } });
  if (!doc) throw new Error(`Document ${args.documentId} not found.`);
  if (!doc.yjsState) throw new Error(`Document ${doc.id} has no saved Yjs state to compare against.`);

  const load = () => prisma.editEvent.findMany({ where: { documentId: doc.id }, orderBy: [{ timestamp: "asc" }, { id: "asc" }] });
  const events = await load();
  const targets = args.eventIds.map((id) => events.find((e) => e.id === id));
  const missing = args.eventIds.filter((_, i) => !targets[i]);
  if (missing.length) throw new Error(`Event(s) ${missing.join(", ")} do not exist in document ${doc.id}.`);
  const notInserts = (targets as EditEvent[]).filter((e) => e.eventType !== "INSERT");
  if (notInserts.length) throw new Error(`Event(s) ${notInserts.map((e) => e.id).join(", ")} are not INSERT events; refusing.`);

  const textLength = plainTextLengthOf(doc.yjsState);
  const names = await userNames([...new Set(events.map((e) => e.userId))]);
  console.log(`Document ${doc.id} (group ${doc.groupId}) on ${dbHost()}`);
  for (const e of targets as EditEvent[]) console.log(`  to remove: ${describeEvent(e, names)}`);

  const before = summarizeEvents(events);
  const idSet = new Set(args.eventIds);
  const projected = summarizeEvents(events.filter((e) => !idSet.has(e.id)));
  printSums("BEFORE", before, textLength, names);
  printSums("AFTER (projected)", projected, textLength, names);
  if (projected.slotCount !== textLength && !args.allowUnreconciled) {
    throw new Error(
      `Removing these events leaves ${projected.slotCount} replayed characters but the document has ${textLength}. ` +
        "Refusing. Re-check the ids (or pass --allow-unreconciled if you understand why)."
    );
  }

  const removedUserIds = new Set((targets as EditEvent[]).map((e) => e.userId));
  if (args.sessionIds.length) {
    const sessions = await prisma.editSession.findMany({ where: { id: { in: args.sessionIds } } });
    const bad = args.sessionIds.filter((id) => {
      const s = sessions.find((x) => x.id === id);
      return !s || s.documentId !== doc.id || !removedUserIds.has(s.userId);
    });
    if (bad.length) throw new Error(`Session(s) ${bad.join(", ")} are missing, in another document, or belong to a different user than the removed events; refusing.`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const deletedEvents = await tx.editEvent.deleteMany({ where: { id: { in: args.eventIds }, documentId: doc.id, eventType: "INSERT" } });
    const deletedSessions = args.sessionIds.length
      ? await tx.editSession.deleteMany({ where: { id: { in: args.sessionIds }, documentId: doc.id } })
      : { count: 0 };
    return { events: deletedEvents.count, sessions: deletedSessions.count };
  });
  console.log(`\nDeleted ${result.events} EditEvent row(s) and ${result.sessions} EditSession row(s).`);

  printSums("AFTER (re-read from the database)", summarizeEvents(await load()), textLength, names);
  console.log("\nNow re-run the analysis for this group so its stored report reflects the corrected log.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Database host: ${dbHost()}  mode: ${args.apply ? "APPLY" : "dry run"}`);
  if (args.apply) await apply(args);
  else await audit(args);
}

main()
  .catch((err) => {
    console.error(`\nError: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
