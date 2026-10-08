import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnalysisStepper } from "./AnalysisStepper";
import type { AnalyzeProgress } from "../lib/analyzeStream";

// Words that would indicate scoring output leaking into the panel. The step's own labels
// ("Compute scores", "Scores computed by formula") are the only allowed uses of "score".
const SCORE_WORDS = /score|gini|health|free-rider|overload|inactive|share|flag/i;
const withoutStepLabels = (text: string | null) =>
  (text ?? "").replace(/Compute scores/g, "").replace(/Scores computed by formula/g, "");

function mockReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("AnalysisStepper", () => {
  it("GITHUB: shows only the GitHub source with its live counts", () => {
    mockReducedMotion(true);
    const progress: AnalyzeProgress = { stage: "collecting", github: { contributors: 3, commits: 42, files: 17 } };
    render(<AnalysisStepper sourceType="GITHUB" progress={progress} done={false} />);

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.queryByText("FairTraze Docs")).not.toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("commits")).toBeInTheDocument();
  });

  it("EDITOR: shows only the Docs source with sessions and characters", () => {
    mockReducedMotion(true);
    const progress: AnalyzeProgress = { stage: "collecting", docs: { sessions: 5, characters: 12345 } };
    render(<AnalysisStepper sourceType="EDITOR" progress={progress} done={false} />);

    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    expect(screen.getByText("FairTraze Docs")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText((12345).toLocaleString())).toBeInTheDocument();
  });

  it("COMBINED: shows both sources, and Docs reads 'Waiting…' until its first event", () => {
    mockReducedMotion(true);
    const progress: AnalyzeProgress = { stage: "collecting", github: { contributors: 1, commits: 2, files: 3 } };
    const { rerender } = render(<AnalysisStepper sourceType="COMBINED" progress={progress} done={false} />);

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("FairTraze Docs")).toBeInTheDocument();
    expect(screen.getByText("Waiting…")).toBeInTheDocument();

    rerender(
      <AnalysisStepper
        sourceType="COMBINED"
        progress={{ ...progress, docs: { sessions: 4, characters: 900 } }}
        done={false}
      />
    );
    expect(screen.queryByText("Waiting…")).not.toBeInTheDocument();
    expect(screen.getByText("900")).toBeInTheDocument();
  });

  it("advances steps only from the reported stage, and never shows score words", () => {
    mockReducedMotion(true);
    const base: AnalyzeProgress = { stage: "compute", github: { contributors: 2, commits: 8, files: 9 } };
    const { container, rerender } = render(<AnalysisStepper sourceType="GITHUB" progress={base} done={false} />);

    expect(screen.getByText("Scores computed by formula")).toBeInTheDocument();
    expect(withoutStepLabels(container.textContent)).not.toMatch(SCORE_WORDS);
    expect(screen.queryByText("Analysis complete")).not.toBeInTheDocument();

    rerender(<AnalysisStepper sourceType="GITHUB" progress={base} done={true} />);
    expect(screen.getByText("AI explanation available on demand")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Analysis complete");
    expect(withoutStepLabels(container.textContent)).not.toMatch(SCORE_WORDS);
  });

  it("shows 'Loading report…' after completion", () => {
    mockReducedMotion(true);
    render(<AnalysisStepper sourceType="GITHUB" progress={{ stage: "save" }} done={true} loadingReport={true} />);
    expect(screen.getByText("Loading report…")).toBeInTheDocument();
  });

  it("reduced motion: counts render at their final value immediately and spinners carry motion-reduce", () => {
    mockReducedMotion(true);
    const progress: AnalyzeProgress = { stage: "collecting", github: { contributors: 9, commits: 999, files: 77 } };
    const { container } = render(<AnalysisStepper sourceType="GITHUB" progress={progress} done={false} />);

    expect(screen.getByText("999")).toBeInTheDocument();
    const spinners = container.querySelectorAll(".animate-spin");
    expect(spinners.length).toBeGreaterThan(0);
    spinners.forEach((el) => expect(el.className).toContain("motion-reduce:animate-none"));
  });
});
