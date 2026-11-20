import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AiBriefCheck, AiReviewResponse } from "../lib/aiReview";
import type { RequirementMark } from "../lib/requirementMarks";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./ui/styles";
import { StatTile } from "./ui/StatTile";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t" }) }));
import { Narrative } from "./Narrative";
import { ToastProvider } from "./Toast";

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
  it("tells the instructor the results changed and keeps the saved text inline", async () => {
    render(<Narrative narrative="Saved text." outdated projectId={1} onNarrativeGenerated={() => {}} />);
    expect(screen.getByText("Out of date. Regenerate.")).toBeTruthy();
    expect(screen.getByText("Saved text.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Team details/ })).toBeNull();
  });

  it("shows no notice when the AI findings are current or missing", () => {
    const { rerender } = render(<Narrative narrative="Saved text." projectId={1} onNarrativeGenerated={() => {}} />);
    expect(screen.queryByText(/Out of date/)).toBeNull();
    rerender(<Narrative narrative={null} outdated projectId={1} onNarrativeGenerated={() => {}} />);
    expect(screen.queryByText(/Out of date/)).toBeNull();
  });
});

describe("Narrative failure wording", () => {
  const gen = (over: Partial<import("../hooks/useGenerateAiReport").AiReportGenerator>): import("../hooks/useGenerateAiReport").AiReportGenerator => ({
    reviewOn: false, generating: false, error: null, warning: null, generate: async () => {}, upToDate: null, busy: false, slow: false, announcement: "", ...over,
  });

  it("shows the error with a Try again button when the explanation could not be written", () => {
    render(<Narrative narrative={null} projectId={1} onNarrativeGenerated={() => {}}
      generator={gen({ error: "The AI findings are unavailable right now. The scores and flags are not affected. Try again later." })} />);
    expect(screen.getByRole("alert").textContent).toContain("The scores and flags are not affected. Try again later.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows a calm note, not an alert, when the saved explanation is kept after a failed regenerate", () => {
    render(<Narrative narrative="Saved text." projectId={1} onNarrativeGenerated={() => {}}
      generator={gen({ warning: "The new AI findings could not be written, so the saved ones are shown. Try again later." })} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("The new AI findings could not be written, so the saved ones are shown. Try again later.")).toBeTruthy();
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
    <ToastProvider>
      <Narrative narrative="Explained. The Gini coefficient is 0.122." projectId={1} onNarrativeGenerated={() => {}}
        review={{ data, error: null, start: vi.fn() }} teamHealth="Healthy" {...extra} />
    </ToastProvider>,
  );
};
const mixed = () => [...found(7), req("No README", "NOT_FOUND"), req("Has charts", "NOT_FOUND", { unverified: true })];

describe("AI findings summary", () => {
  // RPT-07
  it("'Needs a look (2 of 9)' lists the open items, not covered before check, and there is no 'Instructions: k of M' line", async () => {
    renderCard(mixed());
    expect(await screen.findByRole("region", { name: "Needs a look" })).toBeTruthy();
    expect(screen.queryByText(/^Instructions:/)).toBeNull();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("No README");
    expect(items[1]).toContain("Has charts");
    // One label per status, the not-covered group first.
    const groups = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(["Not covered yet (1 of 9)", "Needs your check (1 of 9)"]);
    expect(screen.queryByText(/more$/)).toBeNull();
    // k + N = M: 7 covered, 2 to look at, 9 in all.
    expect(screen.getByRole("button", { name: "7 covered requirements, with proof" })).toBeTruthy();
  });

  it("each item in the box has 'Mark as covered' (instructor action), and the item is not repeated inside the check", async () => {
    renderCard([...found(2), req("No README", "NOT_FOUND")]);
    await screen.findByRole("region", { name: "Needs a look" });
    expect(screen.getAllByRole("button", { name: "Mark as covered" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "2 covered requirements, with proof" }));
    expect(screen.getAllByText("No README")).toHaveLength(1);
    expect(screen.queryByText(/covered requirements . (show|hide)/)).toBeNull();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent).join("|")).toContain("Found 0");
  });

  it("shows every open item in three groups (not covered, partly covered, needs your check), each with one 'View the instructions'", async () => {
    renderCard([...found(2), req("A", "NOT_FOUND"), req("B", "NOT_FOUND"), req("C", "NOT_FOUND", { unverified: true }), req("D", "PARTLY_FOUND")], { instructionsHref: "/class/1/assignment/2" });
    expect(await screen.findAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /more$|Show fewer/ })).toBeNull();
    const groups = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(["Not covered yet (2 of 6)", "Partly covered (1 of 6)", "Needs your check (1 of 6)"]);
    for (const g of groups) {
      expect(screen.getByRole("link", { name: `View the instructions, ${g} (new tab)` })).toBeTruthy();
    }
    const row = screen.getByRole("button", { name: "2 covered requirements, with proof" });
    expect(row.getAttribute("aria-expanded")).toBe("false");
  });

  it("order: the explanation, then 'Needs a look', then the covered requirements", async () => {
    renderCard(mixed());
    const needs = await screen.findByRole("region", { name: "Needs a look" });
    const narrative = screen.getByText(/Explained\./);
    const covered = screen.getByRole("button", { name: "7 covered requirements, with proof" });
    expect(narrative.compareDocumentPosition(needs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(needs.compareDocumentPosition(covered) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no outer title line: the box is named for screen readers only, and the group headings are the only headings", async () => {
    const { container } = renderCard(mixed());
    const box = await screen.findByRole("region", { name: "Needs a look" });
    expect(container.textContent).not.toMatch(/Needs a look \(/);
    expect(box.getAttribute("aria-label")).toBe("Needs a look");
    expect(box.textContent).not.toContain("Needs a look");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Not covered yet (1 of 9)", "Needs your check (1 of 9)"]);
  });

  it("each row has the text on the left and 'Mark as covered' on its right in the same row; the group link shares the heading line", async () => {
    renderCard(mixed(), { instructionsHref: "/class/1/assignment/2" });
    const box = await screen.findByRole("region", { name: "Needs a look" });
    const row = within(box).getAllByRole("listitem")[0];
    expect(row.className).toContain("flex");
    const mark = within(row).getByRole("button", { name: "Mark as covered" });
    expect(row.textContent!.indexOf("No README")).toBeLessThan(row.textContent!.indexOf("Mark as covered"));
    expect(mark.closest("li")).toBe(row);
    const heading = within(box).getByRole("heading", { level: 3, name: "Not covered yet (1 of 9)" });
    expect(within(heading.parentElement!).getByRole("link", { name: /View the instructions/ })).toBeTruthy();
  });

  it("the header says how many need a look, and hides the count at 0", async () => {
    renderCard(mixed());
    expect(await screen.findByText("2 need a look")).toBeTruthy();
    cleanup();
    renderCard([...found(2), req("Only one", "NOT_FOUND")]);
    expect(await screen.findByText("1 needs a look")).toBeTruthy();
    cleanup();
    renderCard(found(3));
    await screen.findByRole("button", { name: "3 covered requirements, with proof" });
    expect(screen.queryByText(/need(s)? a look/)).toBeNull();
  });

  it("a requirement's text opens the instructions at its own sentence and ends with a '›'", async () => {
    const onView = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ marks: [] }) })));
    const data: AiReviewResponse = { ...base, briefCheck: mkCheck([req("Has a login page", "NOT_FOUND", { sourceQuote: "Build a login page." })]) };
    render(<ToastProvider><Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} instructionsAssignmentId={9} instructionsHref="/c/1/a/9" review={{ data, error: null, start: vi.fn() }} /></ToastProvider>);
    const link = await screen.findByRole("button", { name: /Has a login page/ });
    expect(link.textContent).toContain("›");
    expect(screen.queryByRole("button", { name: "See in the instructions" })).toBeNull();
    expect(onView).not.toHaveBeenCalled();
    await userEvent.click(link);
    expect(await screen.findByRole("dialog")).toBeTruthy(); // the instructions window opens
  });

  it("the covered check's header keeps 'View the instructions' and an (i) on its right, even when collapsed", async () => {
    renderCard(mixed(), { instructionsHref: "/class/1/assignment/2" });
    await screen.findByRole("region", { name: "Needs a look" });
    expect(screen.getByRole("link", { name: "View the instructions (new tab)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "About the project instructions check" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "7 covered requirements, with proof" }).getAttribute("aria-expanded")).toBe("false");
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
    render(<ToastProvider><Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} instructionsAssignmentId={9} instructionsHref="/c/1/a/9" review={{ data, error: null, start: vi.fn() }} /></ToastProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Open file (new tab)" }));
    await vi.waitFor(() => expect(openTab).toHaveBeenCalledWith("blob:x", "_blank", "noopener,noreferrer"));
    expect(urls.some((u) => u.includes("/api/assignments/9/attachments/5"))).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull(); // the instructions window did not open
  });

  it("all covered: no Needs a look box and no 'Instructions:' line", async () => {
    renderCard(found(9));
    expect(await screen.findByRole("button", { name: "9 covered requirements, with proof" })).toBeTruthy();
    expect(screen.queryByText(/^Instructions:/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Needs a look" })).toBeNull();
  });

  it("an instructor-confirmed mark counts as covered; a waiting or declined claim does not", async () => {
    const reqs = [...found(7), req("Confirmed one", "NOT_FOUND"), req("Waiting one", "NOT_FOUND"), req("Declined one", "NOT_FOUND"), req("Stale one", "NOT_FOUND")];
    renderCard(reqs, {}, [
      mark("Confirmed one", "INSTRUCTOR", "INSTRUCTOR_CONFIRMED"),
      mark("Waiting one", "LEADER", "LEADER_CLAIM"),
      mark("Declined one", "LEADER", "LEADER_CLAIM_DECLINED"),
      mark("Stale one", "INSTRUCTOR", "INSTRUCTOR_CONFIRMED", true),
    ]);
    expect(await screen.findByRole("heading", { level: 3, name: "Not covered yet (3 of 11)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "8 covered requirements, with proof" })).toBeTruthy();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items.join("|")).not.toContain("Confirmed one");
    expect(items.join("|")).toContain("Waiting one");
    // The confirmed one is listed with the covered ones.
    await userEvent.click(screen.getByRole("button", { name: "8 covered requirements, with proof" }));
    expect(screen.getAllByText("Confirmed one").length).toBeGreaterThan(0);
  });

  it("an item in the box whose older mark went stale still says 'check again'", async () => {
    renderCard([...found(2), req("Old one", "NOT_FOUND")], {}, [mark("Old one", "INSTRUCTOR", "INSTRUCTOR_CONFIRMED", true)]);
    await screen.findByRole("region", { name: "Needs a look" });
    expect(screen.getByText("Instructions changed since your mark. Check again.")).toBeTruthy();
  });

  it("hides the block when the project has no check", () => {
    renderCard(null);
    expect(screen.queryByText(/^Instructions:/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Needs a look" })).toBeNull();
  });

  it("health sentence shows without an AI narrative (the pill lives in the summary bar)", () => {
    renderCard(null, { narrative: null });
    expect(screen.queryByText("Healthy")).toBeNull();
    expect(screen.getByText("Work is shared very evenly.")).toBeTruthy();
  });

  // RPT-06
  it("has no Team details row and no Gini number: the explanation text is inline", () => {
    const { container } = renderCard(found(2), { narrative: "Explained." });
    expect(screen.queryByRole("button", { name: /Team details/ })).toBeNull();
    expect(container.textContent).not.toContain("0.122");
    expect(container.textContent).not.toMatch(/Gini/);
    expect(container.textContent).toContain("Explained.");
  });

  it("no longer says 'Select a member above' in the card", () => {
    renderCard(null, {}, []);
    expect(screen.queryByText(/Select a member above/)).toBeNull();
  });
});

describe("Narrative: one loading block for the whole Generate run", () => {
  const gen = (over: Partial<import("../hooks/useGenerateAiReport").AiReportGenerator>): import("../hooks/useGenerateAiReport").AiReportGenerator => ({
    reviewOn: true, generating: true, error: null, warning: null, generate: async () => {}, upToDate: null, busy: true, slow: false, announcement: "writing", ...over,
  });
  const running = { data: { enabled: true, running: true, canGenerate: true, hasReport: true, summaries: [] }, error: null, start: async () => true } as never;

  it("shows a single 'Generating AI findings…' with the hint, not a second 'Writing AI findings…' block", () => {
    render(<Narrative narrative="Old text." projectId={1} onNarrativeGenerated={() => {}} review={running} generator={gen({})} />);
    expect(screen.getAllByText("Generating AI findings…")).toHaveLength(1);
    expect(screen.queryByText("Writing AI findings…")).toBeNull();
    expect(screen.getByText("This can take up to a minute.")).toBeTruthy();
    expect(screen.queryByText("Old text.")).toBeNull(); // held until the whole run is finished
  });

  it("after the slow limit the same block says it is taking longer than usual", () => {
    render(<Narrative narrative={null} projectId={1} onNarrativeGenerated={() => {}} review={running} generator={gen({ slow: true })} />);
    expect(screen.getByText("This is taking longer than usual. You can try again.")).toBeTruthy();
  });

  it("a page opened while a run is going shows the one 'Writing AI findings…' block", () => {
    render(<Narrative narrative={null} projectId={1} onNarrativeGenerated={() => {}} review={running} generator={gen({ generating: false })} />);
    expect(screen.getByText("Writing AI findings…")).toBeTruthy();
    expect(screen.queryByText("Generating AI findings…")).toBeNull();
  });

  it("shows old stored flag names as Low contribution wording (display only, instructor view)", () => {
    render(<Narrative narrative="Ben is a free-rider. A free-rider flag means a member's total work contribution was very low." projectId={1} onNarrativeGenerated={() => {}} />);
    expect(screen.getByText(/Ben is a low-contribution member\. A low-contribution flag means a member's total work contribution was very low\./)).toBeTruthy();
    expect(screen.queryByText(/free-rider/i)).toBeNull();
  });
});
