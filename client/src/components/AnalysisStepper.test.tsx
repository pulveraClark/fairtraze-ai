import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import { AnalysisStepper } from "./AnalysisStepper";
import { INITIAL_PROGRESS, type AnalyzeProgress } from "../lib/analyzeStream";

// Words that would indicate scoring output leaking into the panel. The formula step labels the
// user asked for ("…the equal share", "…the Gini coefficient") are the only allowed uses.
const SCORE_WORDS = /score|gini|health|free-rider|overload|inactive|share|flag/i;
const FORMULA_LABELS = [
  "Weighting commits by file type",
  "Measuring retained document text",
  "Blending GitHub and Docs",
  "Comparing each member to the equal share",
  "Calculating the Gini coefficient",
];
const withoutFormulaLabels = (text: string | null) =>
  FORMULA_LABELS.reduce((t, l) => t.replace(l, ""), text ?? "");

function mockReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const progressOf = (p: Partial<AnalyzeProgress>): AnalyzeProgress => ({ ...INITIAL_PROGRESS, ...p });

const githubProgress = progressOf({
  github: { contributors: 3, commits: 42, files: 17 },
  githubMembers: [{ name: "Member A", commits: 30 }, { name: "Member B", commits: 1 }, { name: "Member C", commits: 0 }],
  githubDays: { "2026-09-17": 2, "2026-09-19": 1 },
});
const docsProgress = progressOf({
  docs: { sessions: 5, characters: 12345 },
  docsMembers: [{ name: "Member A", sessions: 1, characters: 620 }, { name: "Member B", sessions: 4, characters: 11725 }],
  docsDays: { "2026-09-18": 2, "2026-09-19": 3 },
});

const combined = progressOf({
  github: githubProgress.github,
  githubMembers: githubProgress.githubMembers,
  githubDays: githubProgress.githubDays,
  docs: docsProgress.docs,
  docsMembers: docsProgress.docsMembers,
  docsDays: docsProgress.docsDays,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AnalysisStepper", () => {
  it("GITHUB: shows only the GitHub source, its counts and a row per contributor", () => {
    mockReducedMotion(true);
    render(<AnalysisStepper sourceType="GITHUB" progress={githubProgress} done={false} />);

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.queryByText("FairTraze Docs")).not.toBeInTheDocument();
    expect(screen.queryByText("FairTraze Docs editors")).not.toBeInTheDocument();
    const card = screen.getByRole("region", { name: "GitHub contributors" });
    expect(within(card).getByText("42")).toBeInTheDocument();
    expect(within(card).getByText("17")).toBeInTheDocument();
    expect(within(card).getByText("Member A")).toBeInTheDocument();
    expect(within(card).getByText("30")).toBeInTheDocument();
    expect(within(card).getByText("Member C").closest("li")).toHaveTextContent("0 commits");
    expect(within(card).getByText("Member B").closest("li")).toHaveTextContent("1 commit");
  });

  it("EDITOR: shows only the Docs source with a row per editor", () => {
    mockReducedMotion(true);
    render(<AnalysisStepper sourceType="EDITOR" progress={docsProgress} done={false} />);

    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    expect(screen.getByText("FairTraze Docs")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "FairTraze Docs editors" });
    expect(within(card).getByText((12345).toLocaleString())).toBeInTheDocument();
    expect(within(card).getByText("Member A").closest("li")).toHaveTextContent("1 session · 620 chars");
  });

  it("COMBINED: shows both sources, and Docs reads 'Waiting…' until its first event", () => {
    mockReducedMotion(true);
    const { rerender } = render(<AnalysisStepper sourceType="COMBINED" progress={githubProgress} done={false} />);

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("FairTraze Docs")).toBeInTheDocument();
    expect(screen.getByText("Waiting…")).toBeInTheDocument();

    rerender(<AnalysisStepper sourceType="COMBINED" progress={combined} done={false} />);
    expect(screen.queryByText("Waiting…")).not.toBeInTheDocument();
    expect(screen.getByText("620", { exact: false })).toBeInTheDocument();
  });

  it("flow header: a source line flows only while its events arrive, turns done on collection, Report says Saved only at done", () => {
    mockReducedMotion(false);
    const lines = (c: HTMLElement) => Array.from(c.querySelectorAll("[data-state]")).map((el) => el.getAttribute("data-state"));
    const { container, rerender } = render(<AnalysisStepper sourceType="GITHUB" progress={INITIAL_PROGRESS} done={false} />);
    expect(lines(container)).toEqual(["idle", "idle"]);

    rerender(<AnalysisStepper sourceType="GITHUB" progress={githubProgress} done={false} />);
    expect(lines(container)).toEqual(["flowing", "idle"]);
    expect(container.querySelectorAll(".ft-flow-dot").length).toBeGreaterThan(0);
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();

    rerender(<AnalysisStepper sourceType="GITHUB" progress={{ ...githubProgress, stage: "compute" }} done={false} />);
    expect(lines(container)).toEqual(["done", "flowing"]);

    rerender(<AnalysisStepper sourceType="GITHUB" progress={{ ...githubProgress, stage: "save" }} done={false} />);
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.getByText("Saving")).toBeInTheDocument();

    rerender(<AnalysisStepper sourceType="GITHUB" progress={{ ...githubProgress, stage: "save" }} done={true} />);
    expect(lines(container)).toEqual(["done", "done"]);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("formula labels appear only after the compute event and only for the sources in use", () => {
    mockReducedMotion(true);
    const { rerender } = render(<AnalysisStepper sourceType="COMBINED" progress={combined} done={false} />);
    FORMULA_LABELS.forEach((l) => expect(screen.queryByText(l)).not.toBeInTheDocument());

    rerender(<AnalysisStepper sourceType="COMBINED" progress={{ ...combined, stage: "compute" }} done={false} />);
    FORMULA_LABELS.forEach((l) => expect(screen.getByText(l)).toBeInTheDocument());

    rerender(<AnalysisStepper sourceType="GITHUB" progress={{ ...githubProgress, stage: "compute" }} done={false} />);
    expect(screen.getByText("Weighting commits by file type")).toBeInTheDocument();
    expect(screen.queryByText("Measuring retained document text")).not.toBeInTheDocument();
    expect(screen.queryByText("Blending GitHub and Docs")).not.toBeInTheDocument();
  });

  it("activity by day: draws one column per calendar day received, filling gaps", () => {
    mockReducedMotion(true);
    render(<AnalysisStepper sourceType="COMBINED" progress={combined} done={false} />);

    const chart = screen.getByRole("img", { name: /Commits and edit sessions per day, Sep 17 to Sep 19/ });
    expect(chart.querySelectorAll("[title]")).toHaveLength(3);
    expect(chart.querySelector('[title="Sep 18: 0 commits, 2 edit sessions"]')).not.toBeNull();
    expect(screen.getByText("Commits")).toBeInTheDocument();
    expect(screen.getByText("Edit sessions")).toBeInTheDocument();
  });

  it("shows measured per-stage timings and the total once done", () => {
    mockReducedMotion(true);
    const times = { startedAt: 0, githubAt: 5700, docsAt: 4200, computeAt: 5700, saveAt: 6400, doneAt: 7000 };
    render(
      <AnalysisStepper
        sourceType="COMBINED"
        progress={{ ...combined, stage: "save", times }}
        done={true}
      />
    );
    expect(screen.getByText("Analysis complete in 7.0s")).toBeInTheDocument();
    expect(screen.getByText("Elapsed 7.0s")).toBeInTheDocument();
    expect(screen.getByText("Done in 5.7s")).toBeInTheDocument();
    expect(screen.getByText("Done in 4.2s")).toBeInTheDocument();
    expect(screen.getByText("Docs 4.2s · GitHub 5.7s · Compute 0.7s · Save 0.6s")).toBeInTheDocument();
  });

  it("never shows score words or a 'Loading report…' row", () => {
    mockReducedMotion(true);
    const { container, rerender } = render(
      <AnalysisStepper sourceType="COMBINED" progress={{ ...combined, stage: "compute" }} done={false} />
    );
    expect(withoutFormulaLabels(container.textContent)).not.toMatch(SCORE_WORDS);

    rerender(<AnalysisStepper sourceType="COMBINED" progress={{ ...combined, stage: "save" }} done={true} />);
    expect(screen.getByRole("status")).toHaveTextContent("Analysis complete");
    expect(withoutFormulaLabels(container.textContent)).not.toMatch(SCORE_WORDS);
    expect(screen.queryByText(/Loading report/)).not.toBeInTheDocument();
  });

  it("members pop in one by one with a capped stagger, and everything renders at once when done", () => {
    mockReducedMotion(false);
    vi.useFakeTimers();
    const progress = progressOf({ ...githubProgress });
    const { rerender } = render(<AnalysisStepper sourceType="GITHUB" progress={progress} done={false} />);

    const rows = () => screen.getByRole("region", { name: "GitHub contributors" }).querySelectorAll("li").length;
    expect(rows()).toBe(0);
    act(() => { vi.advanceTimersByTime(190); });
    expect(rows()).toBe(1);
    // Each timer re-arms only after React re-renders, so advance in separate steps.
    for (let i = 0; i < 6; i++) act(() => { vi.advanceTimersByTime(200); });
    expect(rows()).toBe(3);

    // A fresh mount (new analysis) with done=true shows every row with no delay.
    rerender(<AnalysisStepper sourceType="GITHUB" progress={{ ...progress, stage: "save" }} done={true} />);
    expect(rows()).toBe(3);
  });

  it("done flushes pending members and formula labels immediately", () => {
    mockReducedMotion(false);
    vi.useFakeTimers();
    const progress = progressOf({ ...githubProgress, stage: "compute" });
    const { rerender } = render(<AnalysisStepper sourceType="GITHUB" progress={progress} done={false} />);
    expect(screen.queryByText("Calculating the Gini coefficient")).not.toBeInTheDocument();

    rerender(<AnalysisStepper sourceType="GITHUB" progress={progress} done={true} />);
    expect(screen.getByText("Calculating the Gini coefficient")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "GitHub contributors" }).querySelectorAll("li")).toHaveLength(3);
  });

  it("reduced motion: counts render at their final value, no flow dots, spinners carry motion-reduce", () => {
    mockReducedMotion(true);
    const { container } = render(<AnalysisStepper sourceType="GITHUB" progress={{ ...githubProgress, github: { contributors: 9, commits: 999, files: 77 } }} done={false} />);

    expect(screen.getByText("999")).toBeInTheDocument();
    expect(container.querySelectorAll(".ft-flow-dot")).toHaveLength(0);
    const spinners = container.querySelectorAll(".animate-spin");
    expect(spinners.length).toBeGreaterThan(0);
    spinners.forEach((el) => expect(el.className).toContain("motion-reduce:animate-none"));
  });
});
