import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BriefCheckCard } from "./BriefCheckCard";
import type { MarksApi } from "../hooks/useRequirementMarks";
import type { AiBriefCheck } from "../lib/aiReview";
import type { RequirementMark } from "../lib/requirementMarks";
import {
  CONFIRMED_BY_INSTRUCTOR, NOT_KNOWN, NOT_KNOWN_LEADER_MARK, NO_ONE_FOUND, NO_ONE_FOUND_LEADER, WORKED_ON_NOTE,
} from "../lib/workedOnBy";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1 } }) }));
afterEach(() => cleanup());

const K = "a".repeat(32);
const req = (over: object) => ({ text: "Write documentation.", status: "FOUND", unverified: false, evidence: [], sourceQuote: "write documentation", ...over });
const checkOf = (requirements: object[]): AiBriefCheck =>
  ({ requirements, nothingFound: false, generatedAt: "2026-10-27T00:00:00Z", outdated: false } as unknown as AiBriefCheck);
const open = () => userEvent.click(screen.getByText("Project instructions check"));
const rowOf = (text: string) => screen.getAllByRole("listitem").find((li) => li.querySelector("p")?.textContent === text)!;

const mark = (over: Partial<RequirementMark>): RequirementMark => ({
  id: 1, requirementKey: K, requirementText: "Not covered one.", role: "LEADER", status: "LEADER_CLAIM",
  note: null, hasImage: false, imageUrl: null, markedBy: { id: 5, name: "Lea Leader" }, markedByYou: false,
  createdAt: "2026-10-26T10:00:00Z", updatedAt: "2026-10-26T10:00:00Z", stale: false, ...over,
});
const api = (role: "leader" | "instructor", marks: RequirementMark[]): MarksApi => ({
  marks, role, error: null,
  claim: vi.fn(async () => true), confirm: vi.fn(async () => true), decline: vi.fn(async () => true), remove: vi.fn(async () => true),
  loadImage: vi.fn(async () => new Blob(["x"])),
});

describe("Worked on by", () => {
  const check = checkOf([
    req({ text: "Three people.", contributors: ["Aldren B.", "Maya", "Zed Z."] }),
    req({ text: "Covered, nobody matched.", contributors: [] }),
    req({ text: "Not covered one.", status: "NOT_FOUND", key: K, contributors: [] }),
    req({ text: "Not clear one.", status: "NOT_FOUND", unverified: true, contributors: [] }),
  ]);

  it("shows up to 2 names as chips and '+N more', in the order the server sent", async () => {
    render(<BriefCheckCard check={check} instructor />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: /covered/i }));
    const row = within(rowOf("Three people."));
    expect(row.getByText("Worked on by")).toBeTruthy();
    expect(row.getByText("Aldren B.")).toBeTruthy();
    expect(row.getByText("Maya")).toBeTruthy();
    expect(row.queryByText("Zed Z.")).toBeNull();
    expect(row.getByText("+1")).toBeTruthy();
  });

  it("a covered requirement with no matched author shows no 'Worked on by' at all", async () => {
    render(<BriefCheckCard check={check} instructor />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: /covered/i }));
    const row = within(rowOf("Covered, nobody matched."));
    expect(row.queryByText("Worked on by")).toBeNull();
    expect(row.queryByText(NOT_KNOWN)).toBeNull();
    expect(row.queryByText(NO_ONE_FOUND)).toBeNull();
  });

  it("a requirement that is not covered or not clear shows no 'Worked on by' line when there are no names", async () => {
    render(<BriefCheckCard check={check} instructor />);
    await open();
    for (const t of ["Not covered one.", "Not clear one."]) {
      expect(within(rowOf(t)).queryByText("Worked on by")).toBeNull();
      expect(within(rowOf(t)).queryByText(NO_ONE_FOUND)).toBeNull();
    }
  });

  it("the leader's card shows no empty 'Worked on by' either", async () => {
    render(<BriefCheckCard check={check} />);
    await open();
    expect(screen.queryByText(NO_ONE_FOUND_LEADER)).toBeNull();
    expect(screen.queryByText("Worked on by")).toBeNull();
  });

  it("a leader claim not yet confirmed reads 'Not known. Marked by the leader.' and a declined one does not", async () => {
    const { rerender } = render(<BriefCheckCard check={check} marks={api("leader", [mark({})])} />);
    await open();
    expect(within(rowOf("Not covered one.")).getByText(NOT_KNOWN_LEADER_MARK)).toBeTruthy();
    rerender(<BriefCheckCard check={check} marks={api("leader", [mark({ status: "LEADER_CLAIM_DECLINED" })])} />);
    expect(within(rowOf("Not covered one.")).queryByText(NOT_KNOWN_LEADER_MARK)).toBeNull();
    expect(within(rowOf("Not covered one.")).queryByText("Worked on by")).toBeNull();
  });

  it("after the instructor confirms it reads 'Confirmed by the instructor.' with no invented name", async () => {
    const marks = [mark({}), mark({ id: 2, role: "INSTRUCTOR", status: "INSTRUCTOR_CONFIRMED", markedBy: { id: 9, name: "Ida Instructor" } })];
    render(<BriefCheckCard check={check} instructor marks={api("instructor", marks)} />);
    await open();
    const row = within(rowOf("Not covered one."));
    expect(row.getByText(CONFIRMED_BY_INSTRUCTOR)).toBeTruthy();
    expect(row.queryByText("Ida I.")).toBeNull();
  });

  it("the note appears once per card", async () => {
    render(<BriefCheckCard check={check} instructor />);
    await open();
    expect(screen.getAllByText(WORKED_ON_NOTE)).toHaveLength(1);
  });

  it("with no contributor data from the server there is no line and no note", async () => {
    render(<BriefCheckCard check={checkOf([req({ text: "Plain." })])} instructor />);
    await open();
    expect(screen.queryByText("Worked on by")).toBeNull();
    expect(screen.queryByText(WORKED_ON_NOTE)).toBeNull();
  });
});
