import { describe, it, expect } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { computeDocumentRawStats } from "../src/collab/editStats.js";
import { computeDocumentTeamReport } from "@shared/documentScoring.js";
import { createUser, createProject } from "./factories.js";

// Active day = an Asia/Manila day on which the member wrote >= 30 characters that are still in the
// final document. Real EditEvent rows -> computeDocumentRawStats -> computeDocumentTeamReport.
describe("retainedCharsByDay -> active days", () => {
  it("counts only days whose surviving characters reach the threshold, bucketed by Manila day", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();
    const document = await prisma.document.create({ data: { groupId: project.id } });
    const ev = (data: { eventType: "INSERT" | "DELETE"; position: number; length: number; timestamp: string }) =>
      prisma.editEvent.create({
        data: { documentId: document.id, userId: user.id, editType: data.eventType === "INSERT" ? "SUBSTANTIVE" : undefined,
          source: "LIVE", ...data, timestamp: new Date(data.timestamp) },
      });

    // Day 1 (Manila Jan 1): 40 chars written, all kept             -> counts
    await ev({ eventType: "INSERT", position: 0, length: 40, timestamp: "2024-01-01T02:00:00Z" });
    // Day 2 (Manila Jan 2): 1 char                                  -> does not count
    await ev({ eventType: "INSERT", position: 40, length: 1, timestamp: "2024-01-02T02:00:00Z" });
    // Day 3 (Manila Jan 3): 50 written, 30 of them deleted later    -> 20 retained, does not count
    await ev({ eventType: "INSERT", position: 41, length: 50, timestamp: "2024-01-03T02:00:00Z" });
    await ev({ eventType: "DELETE", position: 61, length: 30, timestamp: "2024-01-04T02:00:00Z" });
    // Day 5: 16:00Z Jan 4 is already Jan 5 in Manila; 30 chars     -> counts as Jan 5
    await ev({ eventType: "INSERT", position: 61, length: 30, timestamp: "2024-01-04T16:00:00Z" });

    const [raw] = await computeDocumentRawStats(document.id, [{ userId: user.id, studentName: "A", githubUsername: "" }]);
    expect(raw.retainedCharsByDay).toEqual({ "2024-01-01": 40, "2024-01-02": 1, "2024-01-03": 20, "2024-01-05": 30 });

    const report = computeDocumentTeamReport([raw]);
    expect(report.members[0].activeDays).toBe(2);
  });
});
