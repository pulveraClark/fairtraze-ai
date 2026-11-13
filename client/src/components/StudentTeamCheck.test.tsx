import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AiBriefCheck } from "../lib/aiReview";
import { StudentTeamCheck, CHECK_OUTDATED_TEXT, checkHeaderText, hasStudentCheck } from "./StudentTeamCheck";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t" }) }));
vi.mock("../hooks/useRequirementMarks", () => ({
  useRequirementMarks: () => ({
    marks: [], role: "leader", error: null,
    claim: vi.fn(), confirm: vi.fn(), decline: vi.fn(), remove: vi.fn(), loadImage: vi.fn(),
  }),
}));

type Req = AiBriefCheck["requirements"][number];
const req = (i: number, status: Req["status"]): Req => ({
  key: `k${i}`, text: `Requirement ${i}`, status, unverified: false, evidence: [], sourceQuote: `Requirement ${i}`,
});
const check = (reqs: Req[], extra: Partial<AiBriefCheck> = {}): AiBriefCheck => ({
  requirements: reqs, nothingFound: false, generatedAt: new Date().toISOString(), outdated: false, ...extra,
});

describe("StudentTeamCheck (leader's instructions check)", () => {
  it("is collapsed by default with one header line, and no AI pill, disclaimer or time", () => {
    render(<StudentTeamCheck projectId={1} onViewInstructions={() => {}} check={check([req(1, "FOUND"), req(2, "FOUND"), req(3, "NOT_FOUND")])} />);
    const header = screen.getByRole("button", { name: checkHeaderText(2, 3) });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Requirement 3")).toBeNull();
    expect(screen.queryByText(/AI findings/)).toBeNull();
    expect(screen.queryByText(/can be wrong|May be wrong|not a grade|Based on the analysis|Generate/i)).toBeNull();
  });

  it("opened, it lists only what is not covered, with a small 'We have this' and 'See in the instructions'", async () => {
    const user = userEvent.setup();
    render(<StudentTeamCheck projectId={1} onViewInstructions={() => {}} check={check([req(1, "FOUND"), req(2, "NOT_FOUND")])} />);
    await user.click(screen.getByRole("button", { name: "Project instructions: 1 of 2 covered" }));
    expect(screen.getByText("Requirement 2")).toBeTruthy();
    expect(screen.queryByText("Requirement 1")).toBeNull();
    expect(screen.getByRole("button", { name: "See in the instructions" })).toBeTruthy();
    const mark = screen.getByRole("button", { name: "We have this" });
    expect(mark.className).toContain("min-h-8");
    expect(mark.className).not.toContain("min-h-10");
    // The covered ones are one small click away.
    await user.click(screen.getByRole("button", { name: "Show 1 covered" }));
    expect(screen.getByText("Requirement 1")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Hide 1 covered" }));
    expect(screen.queryByText("Requirement 1")).toBeNull();
  });

  it("all covered: 'All N covered', nothing to open, and a small 'Show N covered'", async () => {
    const user = userEvent.setup();
    render(<StudentTeamCheck projectId={1} check={check([req(1, "FOUND"), req(2, "FOUND")])} />);
    expect(screen.getByText("Project instructions: All 2 covered")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Project instructions/ })).toBeNull();
    expect(screen.queryByText("Requirement 1")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show 2 covered" }));
    expect(screen.getByText("Requirement 1")).toBeTruthy();
    expect(screen.getByText("Requirement 2")).toBeTruthy();
  });

  it("out of date: says the instructor can refresh it, never 'Generate again'", () => {
    render(<StudentTeamCheck projectId={1} check={check([req(1, "FOUND")], { outdated: true })} />);
    expect(screen.getByText(CHECK_OUTDATED_TEXT)).toBeTruthy();
    expect(CHECK_OUTDATED_TEXT).toBe("May be out of date. Your instructor can refresh it.");
    expect(screen.queryByText(/Generate again/)).toBeNull();
  });

  it("hasStudentCheck: nothing to show for no requirements, something for nothingRead", () => {
    expect(hasStudentCheck(undefined)).toBe(false);
    expect(hasStudentCheck(check([]))).toBe(false);
    expect(hasStudentCheck(check([], { nothingRead: true }))).toBe(true);
    expect(hasStudentCheck(check([req(1, "FOUND")]))).toBe(true);
  });
});
