import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BriefCheckCard } from "./BriefCheckCard";

URL.createObjectURL = vi.fn(() => "blob:mark");
URL.revokeObjectURL = vi.fn();
import type { MarksApi } from "../hooks/useRequirementMarks";
import {
  INSTRUCTOR_WAITING, LEADER_DECLINED, LEADER_WAITING, MARK_STALE, confirmedByInstructor, coveredByAiSentence,
  marksByKey, staleMarks, waitingClaims, type RequirementMark,
} from "../lib/requirementMarks";
import type { AiBriefCheck } from "../lib/aiReview";

vi.mock("../lib/briefImage", async (orig) => ({
  ...(await orig<typeof import("../lib/briefImage")>()),
  prepareBriefImage: vi.fn(async () => new Blob(["x"], { type: "image/webp" })),
}));

const K = "a".repeat(32);
const COVERED_K = "b".repeat(32);
const req = (over: object) => ({ text: "Write system documentation.", status: "NOT_FOUND", unverified: true, key: K, evidence: [], sourceQuote: "write its system documentation", ...over });
const check = (requirements: object[] = [
  req({}),
  req({ text: "Build a planner.", status: "FOUND", unverified: false, key: COVERED_K, sourceQuote: "Build a planner" }),
]): AiBriefCheck => ({ requirements, nothingFound: false, generatedAt: "2026-10-27T00:00:00Z", outdated: false } as unknown as AiBriefCheck);

const mark = (over: Partial<RequirementMark>): RequirementMark => ({
  id: 1, requirementKey: K, requirementText: "Write system documentation.", role: "LEADER", status: "LEADER_CLAIM",
  note: "In the User Guide", hasImage: false, imageUrl: null, markedBy: { id: 5, name: "Lea Leader" }, markedByYou: false,
  createdAt: "2026-10-26T10:00:00Z", updatedAt: "2026-10-26T10:00:00Z", stale: false, ...over,
});

const api = (role: "leader" | "instructor", marks: RequirementMark[] = []): MarksApi => ({
  marks, role, error: null,
  claim: vi.fn(async () => true), confirm: vi.fn(async () => true), decline: vi.fn(async () => true), remove: vi.fn(async () => true),
  loadImage: vi.fn(async () => new Blob(["img"], { type: "image/png" })),
});

async function open() {
  await userEvent.click(screen.getByText("Project instructions check"));
}

describe("marks: summary and grouping", () => {
  it("'12 of 13 covered by the AI, 1 confirmed by the instructor.'", () => {
    expect(coveredByAiSentence(12, 13, 1)).toBe("12 of 13 covered by the AI, 1 confirmed by the instructor.");
  });

  it("only an instructor confirmation counts; a leader claim, declined or not, never does", () => {
    const reqs = check().requirements;
    expect(confirmedByInstructor(reqs, [mark({})])).toBe(0);
    expect(confirmedByInstructor(reqs, [mark({ status: "LEADER_CLAIM_DECLINED" })])).toBe(0);
    expect(confirmedByInstructor(reqs, [mark({ role: "INSTRUCTOR", status: "INSTRUCTOR_CONFIRMED" })])).toBe(1);
    expect(confirmedByInstructor(reqs, [mark({ role: "INSTRUCTOR", status: "INSTRUCTOR_CONFIRMED", stale: true })])).toBe(0);
    expect(waitingClaims([mark({}), mark({ id: 2, status: "LEADER_CLAIM_DECLINED" })])).toBe(1);
  });

  it("current marks group by key and stale ones are listed once", () => {
    const m = marksByKey([mark({}), mark({ id: 2, role: "INSTRUCTOR", status: "INSTRUCTOR_CONFIRMED" }), mark({ id: 3, requirementKey: "c".repeat(32), stale: true })]);
    expect(m.get(K)?.leader?.id).toBe(1);
    expect(m.get(K)?.instructor?.id).toBe(2);
    expect(m.has("c".repeat(32))).toBe(false);
    expect(staleMarks([mark({ id: 3, stale: true }), mark({ id: 4, stale: true })])).toHaveLength(1);
  });
});

describe("leader", () => {
  beforeEach(() => cleanup());

  it("sees 'We have this' only on a 'Not clear yet' item, never on a covered one", async () => {
    render(<BriefCheckCard check={check()} marks={api("leader")} />);
    await open();
    expect(screen.getAllByRole("button", { name: "We have this" })).toHaveLength(1);
  });

  it("sends a note and a pasted picture (Ctrl+V), then the claim is waiting with Undo", async () => {
    const a = api("leader");
    render(<BriefCheckCard check={check()} marks={a} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "We have this" }));
    await userEvent.type(screen.getByLabelText(/Where is it/), "User Guide, page 3");

    const file = new File(["png"], "shot.png", { type: "image/png" });
    fireEvent.paste(screen.getByLabelText(/Where is it/), { clipboardData: { files: [file], getData: () => "" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove picture" })).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(a.claim).toHaveBeenCalledWith(K, "User Guide, page 3", expect.any(Blob));
  });

  it("offers 'Add a picture' as the keyboard and phone fallback, and caps the note at 140", async () => {
    render(<BriefCheckCard check={check()} marks={api("leader")} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "We have this" }));
    expect(screen.getByRole("button", { name: "Add a picture" }).className).toContain("min-h-10");
    expect(screen.getByLabelText(/Where is it/).getAttribute("maxlength")).toBe("140");
  });

  it("a waiting claim shows who and when, keeps the AI result, and Undo removes it", async () => {
    const a = api("leader", [mark({ markedByYou: true })]);
    render(<BriefCheckCard check={check()} marks={a} />);
    await open();
    const box = within(screen.getByRole("group", { name: "You marked this as covered" }));
    expect(box.getByText(LEADER_WAITING)).toBeTruthy();
    expect(box.getByText(/You · Oct 26/)).toBeTruthy();
    expect(box.getByText(/In the User Guide/)).toBeTruthy();
    expect(screen.getByText("Not clear yet")).toBeTruthy(); // the AI result stays
    await userEvent.click(box.getByRole("button", { name: "Undo" }));
    expect(a.remove).toHaveBeenCalledWith(1);
  });

  it("a declined claim reads 'The instructor has not accepted this yet.' and can be sent again", async () => {
    render(<BriefCheckCard check={check()} marks={api("leader", [mark({ markedByYou: true, status: "LEADER_CLAIM_DECLINED" })])} />);
    await open();
    expect(screen.getByText(LEADER_DECLINED)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Send a new note or picture" }));
    expect((screen.getByLabelText(/Where is it/) as HTMLInputElement).value).toBe("In the User Guide");
  });

  it("a claim is not covered: the summary stays as the AI said it", async () => {
    render(<BriefCheckCard check={check()} marks={api("leader", [mark({ markedByYou: true })])} />);
    await open();
    expect(screen.getByText(/1 of 2 requirements are covered in the work/)).toBeTruthy();
    expect(screen.queryByText(/confirmed by the instructor\./)).toBeNull();
  });
});

describe("instructor", () => {
  beforeEach(() => cleanup());

  it("sees the leader's claim with note, then Confirm or 'Not yet'", async () => {
    const a = api("instructor", [mark({})]);
    render(<BriefCheckCard check={check()} instructor marks={a} />);
    await open();
    const box = within(screen.getByRole("group", { name: "The leader says this is covered" }));
    expect(box.getByText(INSTRUCTOR_WAITING)).toBeTruthy();
    expect(box.getByText(/Lea Leader · Oct 26/)).toBeTruthy();
    await userEvent.click(box.getByRole("button", { name: "Not yet" }));
    expect(a.decline).toHaveBeenCalledWith(1);
    await userEvent.click(box.getByRole("button", { name: "Confirm" }));
    expect(a.confirm).toHaveBeenCalledWith(K, "");
  });

  it("after 'Not yet' the instructor reads that they have not accepted it and the leader can send more proof", async () => {
    render(<BriefCheckCard check={check()} instructor marks={api("instructor", [mark({ status: "LEADER_CLAIM_DECLINED" })])} />);
    await open();
    expect(screen.getByText("You have not accepted this yet. The leader can send more proof.")).toBeTruthy();
  });

  it("can mark an item 'I checked: covered' with an optional note", async () => {
    const a = api("instructor");
    render(<BriefCheckCard check={check()} instructor marks={a} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "I checked: covered" }));
    await userEvent.type(screen.getByLabelText(/Note \(optional\)/), "Looked in the repo");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(a.confirm).toHaveBeenCalledWith(K, "Looked in the repo");
  });

  it("after confirming, the summary reads '1 of 2 covered by the AI, 1 confirmed by the instructor.' and the AI result stays", async () => {
    const a = api("instructor", [mark({ id: 9, role: "INSTRUCTOR", status: "INSTRUCTOR_CONFIRMED", markedByYou: true, note: "ok" })]);
    render(<BriefCheckCard check={check()} instructor marks={a} />);
    await open();
    expect(screen.getByText(/^1 of 2 covered by the AI, 1 confirmed by the instructor\.$/)).toBeTruthy(); // nothing left to check
    expect(screen.getByText("Needs your check")).toBeTruthy(); // the AI result stays on the row
    expect(screen.getByText("Confirmed by the instructor")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(a.remove).toHaveBeenCalledWith(9);
  });

  it("a mark whose instructions changed shows 'Instructions changed. Please check again.'", async () => {
    render(<BriefCheckCard check={check()} instructor marks={api("instructor", [mark({ stale: true, requirementKey: "d".repeat(32) })])} />);
    await open();
    expect(screen.getByText(MARK_STALE)).toBeTruthy();
  });
});

describe("members", () => {
  it("never get mark controls: a card without a marks api shows none", async () => {
    render(<BriefCheckCard check={check()} />);
    await open();
    expect(screen.queryByRole("button", { name: "We have this" })).toBeNull();
    expect(screen.queryByRole("button", { name: "I checked: covered" })).toBeNull();
  });
});
