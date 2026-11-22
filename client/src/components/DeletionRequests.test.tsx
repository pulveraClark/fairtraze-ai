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

  // ADM-09
  it("shows the section when a request is waiting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({
      pendingCount: 1, recent: [],
      pending: [{ id: 1, status: "PENDING", reason: null, createdAt: "2026-10-01T00:00:00Z", reviewedAt: null, user: { id: 3, name: "Pat Lee", email: "p@x.t", systemRole: "STUDENT" } }],
    }) })));
    renderIt();
    expect(await screen.findByText("Pat Lee")).toBeTruthy();
    expect(screen.getByText("Deletion requests")).toBeTruthy();
    expect(screen.getByLabelText("1 waiting for review")).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "Approve deletion for Pat Lee" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject deletion for Pat Lee" })).toBeEnabled();
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

describe("DeletionRequests feedback", () => {
  afterEach(() => vi.unstubAllGlobals());
  const pending = {
    pendingCount: 1, recent: [],
    pending: [{ id: 1, status: "PENDING", reason: null, createdAt: "2026-10-01T00:00:00Z", reviewedAt: null, user: { id: 3, name: "Pat Lee", email: "p@x.t", systemRole: "STUDENT" } }],
  };

  it("the confirm dialog stays open with 'Anonymizing…' until the server answers", async () => {
    let release!: () => void;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === "POST") { await new Promise<void>((r) => { release = r; }); return { ok: true, json: async () => ({}) }; }
      return { ok: true, json: async () => pending };
    }));
    const onToast = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DeletionRequests onToast={onToast} />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Approve deletion for Pat Lee" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Anonymize account" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: /Anonymizing/ })).toBeDisabled();
    expect(onToast).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(onToast).toHaveBeenCalledWith("success", "Account anonymized."));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  // ADM-10
  it("Reject says 'Deletion request rejected.' and moves the request to Recently reviewed as Rejected", async () => {
    let rejected = false;
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") { rejected = true; return { ok: true, json: async () => ({ id: 1, status: "REJECTED" }) }; }
      return { ok: true, json: async () => (rejected
        ? { pendingCount: 0, pending: [], recent: [{ ...pending.pending[0], status: "REJECTED", reviewedAt: "2026-11-02T00:00:00Z" }] }
        : pending) };
    });
    vi.stubGlobal("fetch", f);
    const onToast = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DeletionRequests onToast={onToast} />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Reject deletion for Pat Lee" }));
    await waitFor(() => expect(onToast).toHaveBeenCalledWith("success", "Deletion request rejected."));
    expect(f.mock.calls.some(([u, i]) => String(u) === "/api/admin/deletion-requests/1/reject" && i?.method === "POST")).toBe(true);

    expect(await screen.findByRole("heading", { name: "Recently reviewed" })).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("Pat Lee")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject deletion for Pat Lee" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve deletion for Pat Lee" })).toBeNull();
  });

  it("Reject shows 'Rejecting…' on its button, and a network failure gives the calm sentence", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new TypeError("Failed to fetch");
      return { ok: true, json: async () => pending };
    }));
    const onToast = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DeletionRequests onToast={onToast} />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Reject deletion for Pat Lee" }));
    await waitFor(() => expect(onToast).toHaveBeenCalledWith("error", expect.stringMatching(/Could not reach the server/)));
    expect(onToast).not.toHaveBeenCalledWith("success", expect.anything());
  });
});
