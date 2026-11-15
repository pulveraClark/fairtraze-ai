import { describe, it, expect, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProjectScoringConfig } from "@shared/types";
import * as AuthContextModule from "../context/AuthContext";
import { ToastProvider } from "./Toast";
import { AiReviewSwitch } from "./AiReviewSwitch";
import { ScoringSettingsModal } from "./ScoringSettingsModal";
import { InstructorApprovals } from "./InstructorApprovals";
import { useRequirementMarks } from "../hooks/useRequirementMarks";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});
vi.mocked(AuthContextModule.useAuth).mockReturnValue({
  user: { id: 9, email: "a@example.com", name: "Admin", systemRole: "ADMIN" },
  token: "t", loading: false,
  register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
});

afterEach(() => { vi.unstubAllGlobals(); });

const CONFIG: ProjectScoringConfig = {
  weights: { commits: 0.4, lines: 0.4, activeDays: 0.2 },
  thresholds: { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 },
  blend: { wGitHub: 0.55, wDocs: 0.45 },
  docsWeights: { retainedText: 0.37, sessions: 0.30, activeDays: 0.33 },
};

describe("class AI switch", () => {
  it("confirms 'AI findings turned off.' only after the server says ok", async () => {
    let release!: () => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => { release = () => r({ ok: true }); })));
    render(<ToastProvider><AiReviewSwitch classId={3} enabled token="t" onChanged={() => {}} /></ToastProvider>);
    await userEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("AI findings turned off.")).not.toBeInTheDocument();
    await act(async () => { release(); });
    expect(await screen.findByText("AI findings turned off.")).toBeInTheDocument();
  });

  it("a refused save shows the inline line and no success toast", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<ToastProvider><AiReviewSwitch classId={3} enabled token="t" onChanged={() => {}} /></ToastProvider>);
    await userEvent.click(screen.getByRole("switch"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save this setting");
    expect(screen.queryByText(/AI findings turned/)).not.toBeInTheDocument();
  });
});

describe("scoring settings", () => {
  it("says 'Settings saved.' after a good save and shows Saving… while it runs", async () => {
    let release!: () => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => { release = () => r({ ok: true, json: async () => ({ config: CONFIG }) }); })));
    const onSaved = vi.fn();
    render(<ToastProvider><ScoringSettingsModal assignmentId={7} currentConfig={CONFIG} sourceType="GITHUB" onClose={() => {}} onSaved={onSaved} /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
    expect(screen.queryByText("Settings saved.")).not.toBeInTheDocument();
    await act(async () => { release(); });
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalled();
  });

  it("a server refusal shows its message and no success toast", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "The weights must add up to 1.00." }) }));
    render(<ToastProvider><ScoringSettingsModal assignmentId={7} currentConfig={CONFIG} sourceType="GITHUB" onClose={() => {}} onSaved={() => {}} /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("The weights must add up to 1.00.")).toBeInTheDocument();
    expect(screen.queryByText("Settings saved.")).not.toBeInTheDocument();
  });
});

describe("instructor approvals busy state", () => {
  it("the clicked button says Approving… and both row buttons are disabled", async () => {
    let release!: () => void;
    const pending = {
      pendingCount: 1,
      pending: [{ id: 5, name: "Pat Lee", email: "pat@example.com", createdAt: "2026-10-01T00:00:00.000Z" }],
      recent: [],
    };
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") { await new Promise<void>((r) => { release = r; }); return { ok: true, json: async () => ({}) }; }
      return { ok: true, json: async () => pending };
    }));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <InstructorApprovals />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Approve Pat Lee" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve Pat Lee" })).toHaveTextContent("Approving…"));
    expect(screen.getByRole("button", { name: "Approve Pat Lee" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject Pat Lee" })).toBeDisabled();
    await act(async () => { release(); });
  });
});

describe("requirement marks confirmations", () => {
  const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

  it("confirming says 'Marked as covered.' and a failure says nothing of the kind", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ marks: [] }) })));
    const { result } = renderHook(() => useRequirementMarks(4, "t", "instructor"), { wrapper });
    await act(async () => { await result.current.confirm("k1", ""); });
    expect(await screen.findByText("Marked as covered.")).toBeInTheDocument();

    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) =>
      init?.method === "DELETE" ? { ok: false, json: async () => ({ error: "Only the instructor can do this." }) } : { ok: true, json: async () => ({ marks: [] }) }));
    await act(async () => { await result.current.remove(3); });
    expect(screen.queryByText("Mark removed.")).not.toBeInTheDocument();
    expect(result.current.error).toBe("Only the instructor can do this.");
  });

  it("a network failure gives the shared calm sentence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const { result } = renderHook(() => useRequirementMarks(4, "t", "instructor"), { wrapper });
    await act(async () => { await result.current.confirm("k1", ""); });
    expect(result.current.error).toMatch(/couldn't reach the server/i);
  });
});
