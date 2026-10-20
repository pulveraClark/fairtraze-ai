import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeletionRequests } from "./DeletionRequests";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t" }) }));

function renderIt() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DeletionRequests />
    </QueryClientProvider>,
  );
}

describe("DeletionRequests (R7)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders nothing when there are no requests", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ pendingCount: 0, pending: [], recent: [] }) }));
    vi.stubGlobal("fetch", f);
    const { container } = renderIt();
    await waitFor(() => expect(f).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Loading requests…")).toBeNull());
    expect(container.querySelector("section")).toBeNull();
  });

  it("shows the section when a request is waiting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({
      pendingCount: 1, recent: [],
      pending: [{ id: 1, status: "PENDING", reason: null, createdAt: "2026-10-01T00:00:00Z", reviewedAt: null, user: { id: 3, name: "Pat Lee", email: "p@x.t", systemRole: "STUDENT" } }],
    }) })));
    renderIt();
    expect(await screen.findByText("Pat Lee")).toBeTruthy();
    expect(screen.getByText("Deletion requests")).toBeTruthy();
  });

  it("Approve asks in a ConfirmDialog (not window.confirm); the decision is sent only after Anonymize account", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const f = vi.fn(async (_u: string, init?: RequestInit) => ({
      ok: true,
      json: async () => (init?.method === "PATCH" || init?.method === "POST" ? {} : {
        pendingCount: 1, recent: [],
        pending: [{ id: 1, status: "PENDING", reason: null, createdAt: "2026-10-01T00:00:00Z", reviewedAt: null, user: { id: 3, name: "Pat Lee", email: "p@x.t", systemRole: "STUDENT" } }],
      }),
    }));
    vi.stubGlobal("fetch", f);
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Approve deletion for Pat Lee" }));
    const dialog = screen.getByRole("alertdialog", { name: "Anonymize Pat Lee's account?" });
    const writes = () => f.mock.calls.filter((c) => c[1]?.method && c[1].method !== "GET").length;
    expect(writes()).toBe(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(writes()).toBe(0);

    await userEvent.click(screen.getByRole("button", { name: "Approve deletion for Pat Lee" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Anonymize account" }));
    await waitFor(() => expect(writes()).toBe(1));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
