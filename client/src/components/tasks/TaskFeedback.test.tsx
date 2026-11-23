import { describe, it, expect, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as AuthContextModule from "../../context/AuthContext";
import { ToastProvider } from "../Toast";
import { useTaskActions } from "../../hooks/useTaskActions";
import { ManageLabelsDialog } from "./ManageLabelsDialog";
import { AddMilestoneDialog } from "./MilestoneStrip";
import { BulkBar } from "./BulkBar";
import { mkBoard } from "../../../test/taskFixtures";

vi.mock("../../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});
vi.mocked(AuthContextModule.useAuth).mockReturnValue({
  user: { id: 1, email: "a@example.com", name: "Lead", systemRole: "STUDENT" },
  token: "t", loading: false,
  register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
});

afterEach(() => { vi.unstubAllGlobals(); });

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ToastProvider>{children}</ToastProvider>
  </QueryClientProvider>
);

const okFetch = (body: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));

describe("label and milestone toasts (from the actions hook)", () => {
  it("each change is confirmed after the server answers", async () => {
    vi.stubGlobal("fetch", okFetch({ id: 9, name: "Docs", color: "blue" }));
    const { result } = renderHook(() => useTaskActions(7), { wrapper });
    await act(async () => { await result.current.createMilestone({ name: "Beta" }); });
    expect(await screen.findByText("Milestone added.")).toBeInTheDocument();
    await act(async () => { await result.current.createLabel({ name: "Docs", color: "blue" }); });
    expect(await screen.findByText("Label added.")).toBeInTheDocument();
    await act(async () => { await result.current.renameLabel(9, "Writing"); });
    expect(await screen.findByText("Label renamed.")).toBeInTheDocument();
    await act(async () => { await result.current.deleteLabel(9); });
    expect(await screen.findByText("Label deleted.")).toBeInTheDocument();
  });

  it("a refused change throws and shows no success toast", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: "Only the leader can do this." }) })));
    const { result } = renderHook(() => useTaskActions(7), { wrapper });
    await act(async () => { await expect(result.current.createLabel({ name: "Docs", color: "blue" })).rejects.toThrow("Only the leader"); });
    expect(screen.queryByText("Label added.")).not.toBeInTheDocument();
  });
});

describe("ManageLabelsDialog busy and error", () => {
  const board = mkBoard();

  it("shows Adding… and blocks a second click while the label is being added", async () => {
    let release!: () => void;
    const onCreate = vi.fn(() => new Promise<void>((r) => { release = r; }));
    render(<ManageLabelsDialog board={board} onCreate={onCreate} onRename={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("New label"), "Docs");
    await user.dblClick(screen.getByRole("button", { name: "Add label" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Adding/ })).toBeDisabled();
    await act(async () => { release(); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Add label" })).toBeDisabled()); // field was cleared
  });

  it("shows a calm message when adding fails, and keeps what was typed", async () => {
    const onCreate = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    render(<ManageLabelsDialog board={board} onCreate={onCreate} onRename={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("New label"), "Docs");
    await user.click(screen.getByRole("button", { name: "Add label" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server");
    expect(screen.getByLabelText("New label")).toHaveValue("Docs");
  });
});

describe("AddMilestoneDialog busy and error", () => {
  it("shows Adding… while it runs and the error with the button enabled again after a failure", async () => {
    let fail!: (e: unknown) => void;
    const onCreate = vi.fn(() => new Promise<void>((_, reject) => { fail = reject; }));
    render(<AddMilestoneDialog deadline={null} onClose={vi.fn()} onCreate={onCreate} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Beta");
    await user.click(screen.getByRole("button", { name: "Add milestone" }));
    expect(screen.getByRole("button", { name: /Adding/ })).toBeDisabled();
    await act(async () => { fail(new Error("That name is already used.")); });
    expect(await screen.findByRole("alert")).toHaveTextContent("That name is already used.");
    expect(screen.getByRole("button", { name: "Add milestone" })).toBeEnabled();
  });
});

describe("BulkBar busy", () => {
  it("shows Applying… and disables the controls while the server works", () => {
    render(<BulkBar board={mkBoard()} count={2} busy onAction={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("Applying…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to Done" })).toBeDisabled();
  });
});
