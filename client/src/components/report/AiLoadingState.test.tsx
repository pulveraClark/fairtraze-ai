import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnyScoredMember } from "@shared/types";
import { MemberContributionList } from "./MemberContributionList";
import { Narrative } from "../Narrative";
import { MemberWorkSummary } from "./AiWorkSummary";
import { useGenerateAiReport } from "../../hooks/useGenerateAiReport";
import { useAiReview, type UseAiReview } from "../../hooks/useAiReview";
import type { AiReviewResponse } from "../../lib/aiReview";

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1 } }), useAuthOptional: () => ({ token: "t", user: { id: 1 } }) }));

const member = { studentName: "Ana Cruz", contributionShare: 1, flags: [] } as unknown as AnyScoredMember;
const idle: AiReviewResponse = { enabled: true, running: false, canGenerate: true, hasReport: true, summaries: [] };
const running: AiReviewResponse = { ...idle, running: true };

function mockMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query, addEventListener: () => {}, removeEventListener: () => {},
  }));
}

function Page({ data, error = null, start = vi.fn() }: { data: AiReviewResponse; error?: string | null; start?: UseAiReview["start"] }) {
  const review: UseAiReview = { data, error, start };
  const generator = useGenerateAiReport(1, review, () => {});
  return (
    <>
      <MemberContributionList members={[member]} onOpen={() => {}} generator={generator} aiSummaryState={data.running ? "running" : "none"} />
      <Narrative narrative={null} projectId={1} onNarrativeGenerated={() => {}} review={review} generator={generator} />
    </>
  );
}

beforeEach(() => mockMotion(false));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("AI findings loading state", () => {
  it("disables the button and marks it busy while the member findings are written", () => {
    render(<Page data={running} />);
    const btn = screen.getByRole("button", { name: "Generating…" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.className).toContain("min-h-10");
  });

  it("shows the status text, the hints and 3 skeleton lines; the leave line only in Member contributions", () => {
    const { container } = render(<Page data={running} />);
    expect(screen.getAllByText("Writing AI findings…").length).toBe(2);
    expect(screen.getAllByText(/This can take up to a minute\./).length).toBe(2);
    expect(screen.getAllByText(/You can usually leave this page/).length).toBe(1);
    const card = container.querySelector("#narrative-title")!.closest("section")!;
    expect(card.textContent).not.toContain("leave this page");
    expect(card.querySelectorAll("[data-skeleton] > div").length).toBe(3);
  });

  it("has a polite status region that says writing", () => {
    render(<Page data={running} />);
    const live = document.querySelector('[role="status"][aria-live="polite"]')!;
    expect(live.textContent).toBe("Writing AI findings");
  });

  it("puts a skeleton in the member findings area while it runs", () => {
    const { container } = render(<MemberWorkSummary review={{ ...running, summaries: null }} member={{ userId: 1 }} />);
    expect(container.querySelectorAll("[data-skeleton] > div").length).toBe(3);
  });

  it("reduced motion shows static dots and no animation class", () => {
    mockMotion(true);
    const { container } = render(<Page data={running} />);
    expect(container.querySelector('[data-spinner="static"]')?.textContent).toBe("•••");
    expect(container.querySelector('[data-spinner="spin"]')).toBeNull();
    expect(container.innerHTML).not.toContain("animate-spin");
    expect(container.innerHTML).not.toContain("animate-pulse");
  });

  it("normal motion shows the spinning ring", () => {
    const { container } = render(<Page data={running} />);
    expect(container.querySelector('[data-spinner="spin"]')?.className).toContain("animate-spin");
  });

  it("after 90 seconds says it is taking longer and enables the button", () => {
    vi.useFakeTimers();
    render(<Page data={running} />);
    expect((screen.getByRole("button", { name: "Generating…" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => { vi.advanceTimersByTime(89_000); });
    expect(screen.queryByText(/taking longer than usual/)).toBeNull();
    act(() => { vi.advanceTimersByTime(1_500); });
    expect(screen.getAllByText("This is taking longer than usual. You can try again.").length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: /generate/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the error with a Try again action that starts it again", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ narrative: "T." }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<Page data={idle} error="Could not start the AI findings." />);
    expect(screen.getByRole("alert").textContent).toContain("Could not start the AI findings.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});

describe("AI findings updated announcement", () => {
  it("is not announced on first load, or when nothing ran", () => {
    render(<Page data={idle} />);
    expect(document.querySelector('[role="status"][aria-live="polite"]')!.textContent).toBe("");
  });

  it("is not announced when the page opens on a run that is already going", () => {
    render(<Page data={running} />);
    expect(document.querySelector('[role="status"][aria-live="polite"]')!.textContent).toBe("Writing AI findings");
  });

  it("is announced once a run finishes during this visit", () => {
    const { rerender } = render(<Page data={running} />);
    rerender(<Page data={idle} />);
    expect(document.querySelector('[role="status"][aria-live="polite"]')!.textContent).toBe("AI findings updated");
  });

  it("is not announced when the run ends with an error", () => {
    const { rerender } = render(<Page data={running} />);
    rerender(<Page data={idle} error="Could not start the AI findings." />);
    expect(document.querySelector('[role="status"][aria-live="polite"]')!.textContent).toBe("");
  });
});

describe("Try again while the server job is still running", () => {
  it("treats 409 REVIEW_IN_PROGRESS as already running: no error, back to polling", async () => {
    // The server's job is already running, so every read after the first says so.
    let reads = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return { status: 409, ok: false, json: async () => ({ code: "REVIEW_IN_PROGRESS", error: "A review of this group is already running." }) };
      }
      reads += 1;
      return { status: 200, ok: true, json: async () => (reads > 1 ? running : idle) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAiReview(1, "t"));
    await waitFor(() => expect(result.current.data?.running).toBe(false));
    let started = false;
    await act(async () => { started = await result.current.start(); });
    expect(started).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.data?.running).toBe(true);
    // Polling restarted: the group is read again after the POST.
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, i]) => !i?.method).length).toBeGreaterThan(1));
  });
});
