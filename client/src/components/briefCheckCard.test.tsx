import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocSectionProvider } from "../hooks/useDocSectionLink";
import { BriefCheckCard, CHECK_WHY, NOT_CLEAR_WHY, CHECK_WORK_LINE, truncateQuote } from "./BriefCheckCard";
import { StudentWorkSummaries } from "./StudentWorkSummaries";
import { Narrative } from "./Narrative";
import { briefStatusLine, type AiBriefCheck, type AiReviewResponse } from "../lib/aiReview";
import { NO_INSTRUCTIONS_LINE } from "../lib/instructionsCheck";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1 } }) }));
afterEach(() => { vi.unstubAllGlobals(); });

const LONG = "The survey asks members how the work was shared and what each person did during the project. ".repeat(3).trim();
const gh = "https://github.com/example/Trips/commit/a41f9c2d0e5b#diff-abc";
const QUOTE = "The app must have a login page.";
const TESTS_QUOTE = "Write tests for the app.";

const check: AiBriefCheck = {
  generatedAt: "2026-10-26T01:00:00Z",
  outdated: false,
  nothingFound: false,
  aiAddressedCount: 2,
  requirements: [
    { text: "Has a login page", status: "FOUND", unverified: false, sourceQuote: QUOTE, evidence: [
      { type: "file", ref: "src/Login.tsx", quote: "export function Login()", quoteHidden: false, href: gh, isCommit: true, more: [{ sha: "b52e0d3", href: "https://github.com/example/Trips/commit/b52e0d3" }] },
      { type: "file", ref: "src/Login.tsx", quote: "second quote", quoteHidden: false, href: gh, isCommit: true },
      { type: "doc", ref: "Methodology", quote: "", quoteHidden: true },
    ] },
    { text: "Has a survey", status: "FOUND", unverified: false, sourceFile: "brief.pdf", sourcePage: 2, evidence: [{ type: "doc", ref: "Survey", quote: LONG, quoteHidden: false }] },
    { text: "Has charts", status: "PARTLY_FOUND", unverified: false, sourceQuote: "Show the results in charts.", evidence: [] },
    { text: "Has a README", status: "NOT_FOUND", unverified: false, evidence: [] },
    { text: "Has tests", status: "NOT_FOUND", unverified: true, sourceQuote: TESTS_QUOTE, evidence: [] },
  ],
};

const pill = (label: string) => screen.getByText((_c, el) => el?.tagName === "SPAN" && el.textContent?.endsWith(label) === true && el.className.includes("rounded-full"));
const open = () => userEvent.click(screen.getByText("Project instructions check"));
const rowOf = (text: string) => screen.getAllByRole("listitem").find((li) => li.querySelector("p")?.textContent === text)!;

describe("BriefCheckCard", () => {
  it("is collapsed by default, titled 'Project instructions check' with the AI findings badge and no 'may be wrong' in the title", async () => {
    render(<BriefCheckCard check={check} instructor />);
    const details = screen.getByText("Project instructions check").closest("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")!.textContent).toBe("Project instructions checkAI findings");
    await open();
    expect(details.open).toBe(true);
    expect(screen.getByText("AI findings")).toBeTruthy();
    expect(details.querySelector("summary")!.textContent).not.toMatch(/wrong/i);
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("first line says what was compared and that it is not a grade; the activity named follows the source type", async () => {
    const { rerender } = render(<BriefCheckCard check={check} />);
    await open();
    expect(screen.getByText(/The AI compared the members' GitHub and Docs activity with the project instructions\. It can make mistakes, so check anything important\. This is not a grade\./)).toBeTruthy();
    rerender(<BriefCheckCard check={check} sourceType="EDITOR" />);
    expect(screen.getByText(/members' Docs activity with the project instructions/)).toBeTruthy();
    rerender(<BriefCheckCard check={check} sourceType="GITHUB" />);
    expect(screen.getByText(/members' GitHub activity with the project instructions/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "About the project instructions check" })).toBeTruthy();
  });

  it("summary sentence: covered of total, then the other counts with zeros left out", async () => {
    render(<BriefCheckCard check={check} instructor />);
    await open();
    expect(screen.getByText("2 of 5 requirements are covered in the work. 1 partly covered, 1 not covered yet, 1 needs your check.")).toBeTruthy();
  });

  it("omits a zero count; the leader and students read 'not clear yet'", async () => {
    const some = { ...check, requirements: [check.requirements[0]!, check.requirements[2]!, check.requirements[4]!] };
    render(<BriefCheckCard check={some} />);
    await open();
    expect(screen.getByText("1 of 3 requirements are covered in the work. 1 partly covered, 1 not clear yet.")).toBeTruthy();
    expect(screen.queryByText(/not covered yet/)).toBeNull();
  });

  it("all covered: one sentence, no list and no toggle", async () => {
    const all = { ...check, requirements: [check.requirements[0]!, check.requirements[1]!] };
    render(<BriefCheckCard check={all} />);
    await open();
    expect(screen.getByText("All 2 requirements are covered in the work.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button", { name: /covered requirement/ })).toBeNull();
  });

  it("pills carry an icon and text; the instructor sees 'Needs your check', the leader 'Not clear yet'", async () => {
    const { unmount } = render(<BriefCheckCard check={check} instructor />);
    await open();
    expect(pill("Partly covered").textContent).toBe("◐Partly covered");
    expect(pill("Not covered yet").textContent).toBe("○Not covered yet");
    expect(pill("Needs your check").textContent).toBe("?Needs your check");
    unmount();
    render(<BriefCheckCard check={check} />);
    await open();
    expect(pill("Not clear yet").textContent).toBe("?Not clear yet");
    expect(screen.queryByText("Needs your check")).toBeNull();
  });

  it("shows attention items first (partly, not covered, check) with covered ones hidden until the toggle is used", async () => {
    render(<BriefCheckCard check={check} />);
    await open();
    const text = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    const order = ["Has charts", "Has a README", "Has tests"].map((t) => text.findIndex((x) => x.includes(t)));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(screen.queryByText("Has a login page")).toBeNull();

    const toggle = screen.getByRole("button", { name: "Show the 2 covered requirements" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.className).toContain("min-h-10");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide the 2 covered requirements" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Has a login page")).toBeTruthy();
    expect(screen.getByText("Has a survey")).toBeTruthy();
    expect(screen.getAllByText((_c, el) => el?.tagName === "SPAN" && el.textContent === "✓Covered").length).toBe(2);
  });

  it("covered rows keep their proof closed; it starts with where it comes from; code is a file link only, docs show one short quote", async () => {
    const openDoc = vi.fn();
    render(<DocSectionProvider value={openDoc}><BriefCheckCard check={check} instructionsHref="/class/1/assignment/2" /></DocSectionProvider>);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Show the 2 covered requirements" }));
    const proofs = screen.getAllByText("See proof").map((s) => s.closest("details")!);
    expect(proofs.length).toBe(2);
    expect(proofs.every((d) => !d.open)).toBe(true);
    for (const s of screen.getAllByText("See proof")) await userEvent.click(s);

    const login = within(rowOf("Has a login page"));
    expect(login.getByText("From the project instructions:")).toBeTruthy();
    expect(login.getByRole("link", { name: "See in the instructions (new tab)" })).toBeTruthy();
    const files = login.getAllByRole("link", { name: "Open Login.tsx changes on GitHub (new tab)" });
    expect(files.length).toBe(1);
    expect(files[0]!.getAttribute("href")).toBe(gh);
    expect(files[0]!.getAttribute("target")).toBe("_blank");
    expect(files[0]!.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByText("export function Login()")).toBeNull();
    expect(screen.queryByText("second quote")).toBeNull();
    expect(screen.queryByText(/\+1 more/)).toBeNull();
    expect(screen.queryByText(/b52e0d3|a41f9c2/)).toBeNull();
    expect(login.getByText(/Text written by another member is not shown/)).toBeTruthy();

    const survey = within(rowOf("Has a survey"));
    expect(survey.getByText(/From the project instructions \(brief\.pdf, page 2\):/)).toBeTruthy();
    const quote = survey.getByText((_c, el) => el?.tagName === "BLOCKQUOTE")!;
    expect(quote.textContent!.length).toBeLessThanOrEqual(141);
    expect(quote.textContent!.endsWith("…")).toBe(true);
    await userEvent.click(survey.getByRole("link", { name: "Open section Survey in Docs" }));
    expect(openDoc).toHaveBeenCalledWith("Survey");
  });

  it("truncates only long quotes", () => {
    expect(truncateQuote("short")).toBe("short");
    expect(truncateQuote(LONG).length).toBeLessThanOrEqual(141);
  });

  describe("a requirement that needs checking", () => {
    it("instructor: Check / From / Why / Look in, with Docs and repository links", async () => {
      const openDocs = vi.fn();
      render(
        <DocSectionProvider value={openDocs}>
          <BriefCheckCard check={check} instructor repoUrl="https://github.com/example/Trips" instructionsHref="/class/1/assignment/2" />
        </DocSectionProvider>,
      );
      await open();
      const row = within(rowOf("Has tests"));
      expect(row.getByText("Check")).toBeTruthy();
      expect(row.getByText("Does the work include “Has tests”?")).toBeTruthy();
      expect(row.getByText(`Project instructions: “${TESTS_QUOTE}”`)).toBeTruthy();
      expect(row.getByText("Why")).toBeTruthy();
      expect(row.getByText(CHECK_WHY)).toBeTruthy();
      expect(CHECK_WHY).toBe("The AI said yes, but the proof it gave could not be found in the work.");
      expect(row.getByText("Look in")).toBeTruthy();
      await userEvent.click(row.getByRole("link", { name: "Open FairTraze Docs" }));
      expect(openDocs).toHaveBeenCalledWith("");
      const repo = row.getByRole("link", { name: "Open the repository on GitHub (new tab)" });
      expect(repo.getAttribute("href")).toBe("https://github.com/example/Trips");
      expect(repo.getAttribute("target")).toBe("_blank");
      expect(repo.getAttribute("rel")).toContain("noopener");
      expect(repo.className).toContain("min-h-10");
    });

    it("Look in: only the link that exists, a GitHub-only group has no Docs link, and a plain line when neither", async () => {
      const { unmount } = render(<BriefCheckCard check={check} instructor repoUrl="https://github.com/example/Trips" />);
      await open();
      expect(screen.queryByRole("link", { name: "Open FairTraze Docs" })).toBeNull();
      expect(screen.getByRole("link", { name: /Open the repository/ })).toBeTruthy();
      unmount();
      const withDocs = render(
        <DocSectionProvider value={vi.fn()}><BriefCheckCard check={check} instructor sourceType="GITHUB" repoUrl="https://github.com/example/Trips" /></DocSectionProvider>,
      );
      await open();
      expect(screen.queryByRole("link", { name: "Open FairTraze Docs" })).toBeNull();
      withDocs.unmount();
      render(<BriefCheckCard check={check} instructor />);
      await open();
      expect(screen.getByText(CHECK_WORK_LINE)).toBeTruthy();
      expect(CHECK_WORK_LINE).toBe("Please check the group's work for this one.");
    });

    it("leader and students: 'Not clear yet' with Check / From / Why and no Look in", async () => {
      render(<BriefCheckCard check={check} />);
      await open();
      const row = within(rowOf("Has tests"));
      expect(row.getByText("Is “Has tests” in your work?")).toBeTruthy();
      expect(row.getByText(NOT_CLEAR_WHY)).toBeTruthy();
      expect(NOT_CLEAR_WHY).toBe("The AI could not find proof of it. If your group did it, make sure it is in the Docs or the repository.");
      expect(row.queryByText("Look in")).toBeNull();
      expect(row.queryByText(CHECK_WHY)).toBeNull();
    });

    it("a file source reads 'From: <file>, page N'; a requirement with no source has no From line (older checks)", async () => {
      const fromFile = { ...check, requirements: [{ ...check.requirements[4]!, sourceQuote: undefined, sourceFile: "brief.pdf", sourcePage: 3 }, check.requirements[3]!] };
      render(<BriefCheckCard check={fromFile} instructor />);
      await open();
      expect(within(rowOf("Has tests")).getByText("From: brief.pdf, page 3")).toBeTruthy();
      const none = within(rowOf("Has a README"));
      expect(none.queryByText(/From/)).toBeNull();
      expect(none.queryByText("See proof")).toBeNull();
    });
  });

  describe("opening the project instructions", () => {
    it("instructor: 'View the instructions' is a new-tab link, and each sentence link carries the quote in the hash", async () => {
      render(<BriefCheckCard check={check} instructor instructionsHref="/class/1/assignment/2" />);
      await open();
      const view = screen.getByRole("link", { name: "View the instructions (new tab)" });
      expect(view.getAttribute("href")).toBe("/class/1/assignment/2");
      expect(view.getAttribute("target")).toBe("_blank");
      expect(view.getAttribute("rel")).toBe("noopener noreferrer");
      const see = within(rowOf("Has tests")).getByRole("link", { name: "See in the instructions (new tab)" });
      expect(see.getAttribute("href")).toBe(`/class/1/assignment/2#highlight=${encodeURIComponent(TESTS_QUOTE)}`);
      expect(see.getAttribute("href")).not.toContain("?");
    });

    it("leader and students: buttons open the window, the sentence one with that sentence", async () => {
      const onView = vi.fn();
      render(<BriefCheckCard check={check} onViewInstructions={onView} />);
      await open();
      await userEvent.click(screen.getByRole("button", { name: "View the instructions" }));
      expect(onView).toHaveBeenLastCalledWith();
      await userEvent.click(within(rowOf("Has tests")).getByRole("button", { name: "See in the instructions" }));
      expect(onView).toHaveBeenLastCalledWith(TESTS_QUOTE);
      await userEvent.click(within(rowOf("Has charts")).getByRole("button", { name: "See in the instructions" }));
      expect(onView).toHaveBeenLastCalledWith("Show the results in charts.");
    });

    it("no way to open them, no button and no link", async () => {
      render(<BriefCheckCard check={check} />);
      await open();
      expect(screen.queryByText("View the instructions")).toBeNull();
      expect(screen.queryByText("See in the instructions")).toBeNull();
    });
  });

  it("says how many listed items were left out because their source was not found", async () => {
    const { rerender } = render(<BriefCheckCard check={{ ...check, sources: { writtenBrief: true, filesRead: 0, skipped: [], droppedCount: 1 } }} />);
    await open();
    expect(screen.getByText("1 item the AI listed was not found in the project instructions and was left out.")).toBeTruthy();
    rerender(<BriefCheckCard check={{ ...check, sources: { writtenBrief: true, filesRead: 0, skipped: [], droppedCount: 3 } }} />);
    expect(screen.getByText("3 items the AI listed were not found in the project instructions and were left out.")).toBeTruthy();
    rerender(<BriefCheckCard check={{ ...check, sources: { writtenBrief: true, filesRead: 0, skipped: [], droppedCount: 0 } }} />);
    expect(screen.queryByText(/left out/)).toBeNull();
  });

  it("footer: one disclaimer, the date, the outdated notice, and the AI-addressed note for the instructor only", async () => {
    const { rerender } = render(<BriefCheckCard check={{ ...check, outdated: true }} instructor />);
    await open();
    expect(screen.getByText(/May be wrong · Based on the analysis of/)).toBeTruthy();
    expect(screen.getByText(/The project instructions or the analysis changed since\. Generate again to update it\./)).toBeTruthy();
    expect(screen.getByText(/appears to address the AI/)).toBeTruthy();
    expect(screen.queryByText(/supports your assessment/)).toBeNull();
    rerender(<BriefCheckCard check={{ ...check, outdated: false }} />);
    expect(screen.queryByText(/appears to address the AI/)).toBeNull();
    expect(screen.queryByText(/changed since/)).toBeNull();
  });

  it("renders nothing when there are no requirements", () => {
    const { container } = render(<BriefCheckCard check={{ ...check, requirements: [] }} />);
    expect(container.innerHTML).toBe("");
  });
});

const base: AiReviewResponse = { enabled: true, running: false, canGenerate: true, hasReport: true, summaries: [] };

describe("project instructions check placement", () => {
  it("leader view shows the check even before any summary exists, and wires the instructions window", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...base, canGenerate: false, briefCheck: check }) }));
    const onView = vi.fn();
    render(<StudentWorkSummaries projectId={5} isLeader onViewInstructions={onView} />);
    await waitFor(() => expect(screen.getByText("Project instructions check")).toBeTruthy());
    expect(screen.queryByText("What each member worked on")).toBeNull();
    await userEvent.click(screen.getByText("Project instructions check"));
    await userEvent.click(screen.getByRole("button", { name: "View the instructions" }));
    expect(onView).toHaveBeenCalled();
  });

  it("a member response without a check renders nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...base, canGenerate: false }) }));
    const { container } = render(<StudentWorkSummaries projectId={5} isLeader={false} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });

  it("instructor: the check sits in the AI findings card; a failed run gets one calm line", () => {
    const start = vi.fn();
    const { rerender } = render(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={{ data: { ...base, briefCheck: check }, error: null, start }} />);
    expect(screen.getByText("Project instructions check")).toBeTruthy();
    rerender(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={{ data: { ...base, briefFailed: true }, error: null, start }} />);
    expect(screen.queryByText("Project instructions check")).toBeNull();
    expect(screen.getByText("The project instructions check could not run. Try again later.")).toBeTruthy();
    expect(briefStatusLine({ ...base, briefFailed: true, running: true })).toBeNull();
  });

  describe("no instructions added yet (instructor only)", () => {
    const start = vi.fn();
    const renderWith = (data: AiReviewResponse, href?: string) =>
      render(<Narrative narrative={null} projectId={1} onNarrativeGenerated={() => {}} instructionsHref={href} review={{ data, error: null, start }} />);

    it("shows one quiet line with a link to add them when the server says there are none", () => {
      renderWith({ ...base, hasInstructions: false }, "/class/1/assignment/2");
      expect(screen.getByText(NO_INSTRUCTIONS_LINE)).toBeTruthy();
      expect(NO_INSTRUCTIONS_LINE).toBe("Project instructions check · no instructions added yet. Add the project instructions to compare the work with them.");
      const add = screen.getByRole("link", { name: "Add the instructions" });
      expect(add.getAttribute("href")).toBe("/class/1/assignment/2");
      expect(add.className).toContain("min-h-10");
    });

    it("says nothing when instructions exist, when the server did not say, when AI review is off, or for a non-instructor", () => {
      const { unmount } = renderWith({ ...base, hasInstructions: true });
      expect(screen.queryByText(NO_INSTRUCTIONS_LINE)).toBeNull();
      unmount();
      const second = renderWith({ ...base });
      expect(screen.queryByText(NO_INSTRUCTIONS_LINE)).toBeNull();
      second.unmount();
      const third = renderWith({ enabled: false, hasInstructions: false });
      expect(screen.queryByText(NO_INSTRUCTIONS_LINE)).toBeNull();
      third.unmount();
      renderWith({ ...base, canGenerate: false, hasInstructions: false });
      expect(screen.queryByText(NO_INSTRUCTIONS_LINE)).toBeNull();
    });
  });
});
