import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditAssignmentModal } from "./EditAssignmentModal";
import { ToastProvider } from "./Toast";

describe("EditAssignmentModal dialog semantics", () => {
  it("is a modal dialog with the shared 40px close button, and Esc closes it", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // stays on "Loading…"
    const onClose = vi.fn();
    render(<ToastProvider><EditAssignmentModal assignmentId={1} token="t" onClose={onClose} onSaved={() => {}} /></ToastProvider>);
    const dialog = screen.getByRole("dialog", { name: "Edit project" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("h-10");
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("EditAssignmentModal feedback", () => {
  const assignment = { id: 1, title: "Capstone", deadline: "2026-12-01T00:00:00.000Z", maxGroupSize: 5, description: "Build the app described here.", attachments: [] };
  function stub(patch: { ok: boolean; status?: number; body?: unknown }) {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? { ok: patch.ok, status: patch.status ?? 200, json: async () => patch.body ?? {} }
        : { ok: true, status: 200, json: async () => ({ assignment }) }));
  }

  it("says 'Project saved.' after the server accepts the change and closes", async () => {
    stub({ ok: true });
    const onClose = vi.fn();
    render(<ToastProvider><EditAssignmentModal assignmentId={1} token="t" onClose={onClose} onSaved={() => {}} /></ToastProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Project saved.")).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("a refused save shows the server message, stays open and says nothing about saved", async () => {
    stub({ ok: false, status: 400, body: { error: "The deadline must be in the future." } });
    const onClose = vi.fn();
    render(<ToastProvider><EditAssignmentModal assignmentId={1} token="t" onClose={onClose} onSaved={() => {}} /></ToastProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("The deadline must be in the future.")).toBeInTheDocument();
    expect(screen.queryByText("Project saved.")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
