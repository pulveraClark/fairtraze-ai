import { randomInt } from "node:crypto";
import { REPORT_ID_ALPHABET } from "@shared/evidenceReport.js";
import { prisma } from "./prisma.js";

// Report ID for the Contribution Evidence Report, e.g. FT-7K2P-9X. Random from the OS CSPRNG
// (crypto.randomInt, not Math.random): no sequence number, timestamp or id inside, so one cannot
// be guessed from another. Display and verification only; never read by scoring.

function segment(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += REPORT_ID_ALPHABET[randomInt(REPORT_ID_ALPHABET.length)];
  return out;
}

export function generateReportId(): string {
  return `FT-${segment(4)}-${segment(2)}`;
}

/**
 * The Report ID of one analysis: reused when it exists, otherwise made once. `reportId` is unique,
 * so two people opening the page at the same moment end up with the same ID (the loser of the race
 * reads the winner's row). A code that is already taken is simply drawn again.
 */
export async function getOrCreateReportId(projectId: number, reportId: number): Promise<string> {
  const existing = await prisma.reportEvidenceId.findUnique({ where: { reportId } });
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const row = await prisma.reportEvidenceId.create({
        data: { code: generateReportId(), projectId, reportId },
      });
      return row.code;
    } catch (err) {
      if ((err as { code?: string })?.code !== "P2002") throw err;
      const again = await prisma.reportEvidenceId.findUnique({ where: { reportId } });
      if (again) return again.code;
      // Otherwise the random code collided with another report's: draw again.
    }
  }
  throw new Error("Could not make a unique Report ID.");
}
