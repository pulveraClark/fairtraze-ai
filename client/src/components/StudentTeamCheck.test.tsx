import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { normalizeBriefCheck, type AiBriefCheck } from "../lib/aiReview";
import { StudentTeamCheck, STATE_WORDS, CHECK_OUTDATED_TEXT, checkHeaderText, hasStudentCheck } from "./StudentTeamCheck";

const marksHook = vi.fn();
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t" }) }));
vi.mock("../hooks/useRequirementMarks", () => ({
  useRequirementMarks: (...args: unknown[]) => {
    marksHook(...args);
    return { marks: [], role: "leader", error: null, claim: vi.fn(), confirm: vi.fn(), decline: vi.fn(), remove: vi.fn(), loadImage: vi.fn() };
  },
}));

type Req = AiBriefCheck["requirements"][number];
type State = NonNullable<Req["state"]>;
// A requirement as the server sends it to a student: a plain state, no status or unverified.
const req = (i: number, state: State, evidence: Req["evidence"] = []): Req =>
  ({ key: `k${i}`, text: `Requirement ${i}`, state, evidence, sourceQuote: `Requirement ${i}` }) as Req;
const check = (reqs: Req[], extra: Partial<AiBriefCheck> = {}): AiBriefCheck =>
  normalizeBriefCheck({ requirements: reqs, nothingFound: false, generatedAt: new Date().toISOString(), outdated: false, ...extra })!;

describe("StudentTeamCheck (every member's instructions check)", () => {
  it("is collapsed by default with one header line, and no AI pill, disclaimer or time", () => {
    render(<StudentTeamCheck projectId={1} onViewInstructions={() => {}} check={check([req(1, "COVERED"), req(2, "COVERED"), req(3, "NOT_FOUND")])} />);
    const header = screen.getByRole("button", { name: checkHeaderText(2, 3) });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Requirement 3")).toBeNull();
    expect(screen.queryByText(/AI findings/)).toBeNull();
    expect(screen.queryByText(/can be wrong|May be wrong|not a grade|Based on the analysis|Generate/i)).toBeNull();
  });

  // STU-12
  it("opened, every requirement shows its plain status word", async () => {
    const user = userEvent.setup();
    render(<StudentTeamCheck projectId={1} check={check([
      req(1, "COVERED"), req(2, "PARTLY"), req(3, "NOT_FOUND"), req(4, "NOT_CONFIRMED"), req(5, "CONFIRMED"),
    ])} />);
    await user.click(screen.getByRole("button", { name: "Project instructions: 2 of 5 covered" }));
    const word = (n: number) => within(screen.getByText(`Requirement ${n}`).closest("li")!);
    expect(word(1).getByText("Covered")).toBeTruthy();
    expect(word(2).getByText("Partly covered")).toBeTruthy();
    expect(word(3).getByText("Not found yet")).toBeTruthy();
    expect(word(4).getByText("Not confirmed yet")).toBeTruthy();
    expect(word(5).getByText("Confirmed by your instructor")).toBeTruthy();
  });

  it("never shows instructor words, scores or the raw status", async () => {
    const user = userEvent.setup();
    render(<StudentTeamCheck projectId={1} check={check([req(1, "NOT_CONFIRMED"), req(2, "NOT_FOUND")])} />);
    await user.click(screen.getByRole("button", { name: /Project instructions/ }));
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/needs your check|unverified|free[\s-]?rider|gini|%|!/i);
    for (const s of Object.values(STATE_WORDS)) expect(`${s.icon} ${s.word}`).not.toMatch(/!|free[\s-]?rider|gini|band|team health/i);
  });

  it("proof is closed until 'See proof' is pressed", async () => {
    const user = userEvent.setup();
    const evidence: Req["evidence"] = [{ type: "doc", ref: "Intro", quote: "Our login page lets people sign in.", quoteHidden: false }];
    render(<StudentTeamCheck projectId={1} check={check([req(1, "COVERED", evidence)])} />);
    await user.click(screen.getByRole("button", { name: /Project instructions/ }));
    expect(screen.queryByText(/Our login page lets people sign in/)).toBeNull();
    const proof = screen.getByRole("button", { name: /See proof/ });
    expect(proof).toHaveAttribute("aria-expanded", "false");
    await user.click(proof);
    expect(screen.getByText(/Our login page lets people sign in/)).toBeTruthy();
  });

  it("a plain member is read-only: no 'We have this', and no marks request is made", async () => {
    marksHook.mockClear();
    const user = userEvent.setup();
    render(<StudentTeamCheck projectId={1} onViewInstructions={() => {}} check={check([req(1, "NOT_FOUND")])} />);
    await user.click(screen.getByRole("button", { name: /Project instructions/ }));
    expect(screen.queryByRole("button", { name: "We have this" })).toBeNull();
    expect(screen.getByRole("button", { name: "See in the instructions" })).toBeTruthy();
    expect(marksHook).not.toHaveBeenCalled();
  });

  it("the leader keeps 'We have this' on a requirement that is not covered, and not on a covered one", async () => {
    const user = userEvent.setup();
    render(<StudentTeamCheck projectId={1} canClaim onViewInstructions={() => {}} check={check([req(1, "COVERED"), req(2, "NOT_FOUND")])} />);
    await user.click(screen.getByRole("button", { name: "Project instructions: 1 of 2 covered" }));
    expect(within(screen.getByText("Requirement 2").closest("li")!).getByRole("button", { name: "We have this" })).toBeTruthy();
    expect(within(screen.getByText("Requirement 1").closest("li")!).queryByRole("button", { name: "We have this" })).toBeNull();
    expect(marksHook).toHaveBeenCalled();
  });

  it("all covered: 'All N covered' on the same collapsible header", async () => {
    const user = userEvent.setup();
    render(<StudentTeamCheck projectId={1} check={check([req(1, "COVERED"), req(2, "CONFIRMED")])} />);
    const header = screen.getByRole("button", { name: "Project instructions: All 2 covered" });
    expect(screen.queryByText("Requirement 1")).toBeNull();
    await user.click(header);
    expect(screen.getByText("Requirement 1")).toBeTruthy();
    expect(screen.getByText("Requirement 2")).toBeTruthy();
  });

  it("out of date: says the instructor can refresh it, never 'Generate again'", () => {
    render(<StudentTeamCheck projectId={1} check={check([req(1, "COVERED")], { outdated: true })} />);
    expect(screen.getByText(CHECK_OUTDATED_TEXT)).toBeTruthy();
    expect(CHECK_OUTDATED_TEXT).toBe("May be out of date. Your instructor can refresh it.");
    expect(screen.queryByText(/Generate again/)).toBeNull();
  });

  it("hasStudentCheck: nothing to show for no requirements, something for nothingRead", () => {
    expect(hasStudentCheck(undefined)).toBe(false);
    expect(hasStudentCheck(check([]))).toBe(false);
    expect(hasStudentCheck(check([], { nothingRead: true }))).toBe(true);
    expect(hasStudentCheck(check([req(1, "COVERED")]))).toBe(true);
  });
});
