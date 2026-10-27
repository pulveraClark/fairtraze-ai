import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AiBriefCheck, AiReviewResponse } from "../lib/aiReview";
import type { RequirementMark } from "../lib/requirementMarks";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./ui/styles";
import { StatTile } from "./ui/StatTile";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t" }) }));
import { Narrative } from "./Narrative";

describe("Narrative", () => {
  it("has no button of its own; with nothing generated it points to Member contributions", () => {
    render(<Narrative narrative={null} projectId={1} onNarrativeGenerated={() => {}} />);
    expect(screen.queryByRole("button", { name: /generate|regenerate/i })).toBeNull();
    expect(screen.getByText("No AI findings yet. Use the Generate AI findings button in Member contributions above.")).toBeTruthy();
    expect(BUTTON_SECONDARY).toContain("bg-white");
    expect(BUTTON_PRIMARY).toContain("bg-indigo-700");
  });
});

describe("Narrative outdated notice", () => {
  it("tells the instructor the results changed and keeps the saved text (inside Team details)", async () => {
    render(<Narrative narrative="Saved text." outdated projectId={1} onNarrativeGenerated={() => {}} />);
    expect(screen.getByText("Results changed. Generate new AI findings.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /^Team details/ }));
    expect(screen.getByText("Saved text.")).toBeTruthy();
  });

  it("shows no notice when the AI findings are current or missing", () => {
    const { rerender } = render(<Narrative narrative="Saved text." projectId={1} onNarrativeGenerated={() => {}} />);
    expect(screen.queryByText(/Results changed/)).toBeNull();
    rerender(<Narrative narrative={null} outdated projectId={1} onNarrativeGenerated={() => {}} />);
    expect(screen.queryByText(/Results changed/)).toBeNull();
  });
});

describe("StatTile hero", () => {
  it("makes the value the largest text on the tile", () => {
    render(<StatTile hero label="Team health" value="Healthy" />);
    expect(screen.getByText("Healthy").className).toContain("text-3xl");
    render(<StatTile compact label="Members" value={3} />);
    expect(screen.getByText("3").className).toContain("text-xl");
  });
});

// ---- Short summary on top ----
afterEach(() => { vi.unstubAllGlobals(); });

type R = AiBriefCheck["requirements"][number];
const req = (text: string, status: R["status"], extra: Partial<R> = {}): R => ({ text, status, unverified: false, evidence: [], key: text, ...extra });
const found = (n: number): R[] => Array.from({ length: n }, (_, i) => req(`Found ${i}`, "FOUND"));
const mkCheck = (requirements: R[]): AiBriefCheck => ({ generatedAt: "2026-10-26T01:00:00Z", outdated: false, nothingFound: false, requirements });
const base: AiReviewResponse = { enabled: true, running: false, canGenerate: true, hasReport: true, summaries: [] };
const mark = (key: string, role: RequirementMark["role"], status: RequirementMark["status"], stale = false): RequirementMark => ({
  id: 1, requirementKey: key, requirementText: key, role, status, note: null, hasImage: false, imageUrl: null,
  markedBy: { id: 2, name: "A" }, markedByYou: false, createdAt: "2026-10-26T01:00:00Z", updatedAt: "2026-10-26T01:00:00Z", stale,
});
const renderCard = (requirements: R[] | null, extra: Partial<React.ComponentProps<typeof Narrative>> = {}, marks: RequirementMark[] = []) => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ marks }) })));
  const data: AiReviewResponse = { ...base, ...(requirements ? { briefCheck: mkCheck(requirements) } : {}) };
  return render(
    <Narrative narrative="Explained. The Gini coefficient is 0.122." projectId={1} onNarrativeGenerated={() => {}}
      review={{ data, error: null, start: vi.fn() }} teamHealth="Healthy" gini={0.122} {...extra} />,
  );
};
const mixed = () => [...found(7), req("No README", "NOT_FOUND"), req("Has charts", "NOT_FOUND", { unverified: true })];

describe("AI findings summary", () => {
  it("counts '7 of 9 found · 2 need your check' and lists them, not covered before check", async () => {
    renderCard(mixed());
    expect(await screen.findByText("Instructions: 7 of 9 found in the work · 2 need your check")).toBeTruthy();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("No README");
    expect(items[0]).toContain("Not covered yet");
    expect(items[1]).toContain("Has charts");
    expect(items[1]).toContain("Needs your check");
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it("shows at most 2 and a '+N more' that opens the instructions check", async () => {
    renderCard([...found(2), req("A", "NOT_FOUND"), req("B", "NOT_FOUND"), req("C", "NOT_FOUND", { unverified: true }), req("D", "PARTLY_FOUND")]);
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
    const row = screen.getByRole("button", { name: /Project instructions check · all 6, with proof/ });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(screen.getByRole("button", { name: "+2 more" }));
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "2 covered requirements · show" })).toBeTruthy();
    expect(screen.queryByText(/requirements are covered in the work/)).toBeNull(); // the summary line above says it
  });

  it("the check's header keeps 'View the instructions' and an (i) on its right, even when collapsed", async () => {
    renderCard(mixed(), { instructionsHref: "/class/1/assignment/2" });
    await screen.findByText(/^Instructions: 7 of 9/);
    expect(screen.getByRole("link", { name: "View the instructions (new tab)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "About the project instructions check" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Project instructions check · all 9, with proof/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("'Open file' reads the attachment list and then opens the file through the attachment route, not the instructions window", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/api/assignments/9")) return { ok: true, json: async () => ({ assignment: { attachments: [{ id: 5, kind: "PDF", mime: "application/pdf", filename: "Brief.pdf", size: 10, order: 0 }] } }) };
      if (url.includes("/attachments/5")) return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
      return { ok: true, json: async () => ({ marks: [] }) };
    }));
    const openTab = vi.fn();
    vi.stubGlobal("open", openTab);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const data: AiReviewResponse = { ...base, briefCheck: mkCheck([req("From the file", "NOT_FOUND", { sourceFile: "brief.pdf" })]) };
    render(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} instructionsAssignmentId={9} instructionsHref="/c/1/a/9" review={{ data, error: null, start: vi.fn() }} />);
    await userEvent.click(await screen.findByRole("button", { name: /Project instructions check · all 1/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Open file (new tab)" }));
    await vi.waitFor(() => expect(openTab).toHaveBeenCalledWith("blob:x", "_blank", "noopener,noreferrer"));
    expect(urls.some((u) => u.includes("/api/assignments/9/attachments/5"))).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull(); // the instructions window did not open
  });

  it("all found: one calm line and no Needs a look block", async () => {
    renderCard(found(9));
    expect(await screen.findByText("Instructions: 9 of 9 found in the work. Nothing needs your check.")).toBeTruthy();
    expect(screen.queryByText("Needs a look")).toBeNull();
  });

  it("an instructor-confirmed mark counts as found; a waiting or declined claim does not", async () => {
    const reqs = [...found(7), req("Confirmed one", "NOT_FOUND"), req("Waiting one", "NOT_FOUND"), req("Declined one", "NOT_FOUND"), req("Stale one", "NOT_FOUND")];
    renderCard(reqs, {}, [
      mark("Confirmed one", "INSTRUCTOR", "INSTRUCTOR_CONFIRMED"),
      mark("Waiting one", "LEADER", "LEADER_CLAIM"),
      mark("Declined one", "LEADER", "LEADER_CLAIM_DECLINED"),
      mark("Stale one", "INSTRUCTOR", "INSTRUCTOR_CONFIRMED", true),
    ]);
    expect(await screen.findByText("Instructions: 8 of 11 found in the work · 3 need your check")).toBeTruthy();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items.join("|")).not.toContain("Confirmed one");
    expect(items.join("|")).toContain("Waiting one");
  });

  it("hides the instructions line and the block when the project has no check", () => {
    renderCard(null);
    expect(screen.queryByText(/^Instructions:/)).toBeNull();
    expect(screen.queryByText("Needs a look")).toBeNull();
  });

  it("health chip and sentence show without an AI narrative", () => {
    renderCard(null, { narrative: null });
    expect(screen.getByText("Healthy")).toBeTruthy();
    expect(screen.getByText("Work is shared very evenly.")).toBeTruthy();
  });

  it("the Gini number appears only inside Team details", async () => {
    const { container } = renderCard(found(2));
    const header = screen.getByRole("button", { name: /^Team details · Gini 0\.122, how the team health is read/ });
    expect(container.textContent).not.toContain("Explained.");
    expect(container.textContent?.replace(header.textContent ?? "", "")).not.toContain("0.122");
    await userEvent.click(header);
    expect(screen.getByText(/The Gini coefficient is 0\.122/)).toBeTruthy();
  });

  it("no longer says 'Select a member above' in the card", () => {
    renderCard(null, {}, []);
    expect(screen.queryByText(/Select a member above/)).toBeNull();
  });
});
