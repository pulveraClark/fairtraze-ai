import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterProvider } from "../router";
import { AuditLogPage } from "./AuditLogPage";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 1, name: "Admin", systemRole: "ADMIN" } }),
}));

const entry = (id: number, action: string, actorName: string, createdAt: string) => ({
  id, actorName, action, targetType: "USER", targetId: String(id), details: null, createdAt,
});

afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  // The server sorts newest first and applies the action filter; the page shows what it is sent.
  const fetchMock = vi.fn(async (url: string) => {
    const action = new URL(String(url), "http://x").searchParams.get("action");
    const all = [
      entry(3, "USER_DEACTIVATED", "Admin C", "2026-11-03T10:00:00Z"),
      entry(2, "ROLE_CHANGED", "Admin B", "2026-11-02T10:00:00Z"),
      entry(1, "ROLE_CHANGED", "Admin A", "2026-11-01T10:00:00Z"),
    ];
    const entries = action ? all.filter((e) => e.action === action) : all;
    return { ok: true, json: async () => ({ entries, total: entries.length, page: 1, pageSize: 20, totalPages: 1 }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<RouterProvider><AuditLogPage /></RouterProvider>);
  return fetchMock;
}

describe("AuditLogPage", () => {
  it("ADM-06: lists the entries newest first, as the server sends them, and says so", async () => {
    renderPage();
    await screen.findByText("Admin C");
    expect(screen.getByText(/most-recent first/)).toBeInTheDocument();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1); // skip the header row
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Admin C")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Admin B")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Admin A")).toBeInTheDocument();
    expect(within(rows[0]).getByText("USER DEACTIVATED")).toBeInTheDocument();
  });

  it("ADM-06: choosing an action asks the server for only that action and shows only those rows", async () => {
    const fetchMock = renderPage();
    await screen.findByText("Admin C");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ROLE_CHANGED" } });
    await waitFor(() => expect(screen.queryByText("Admin C")).toBeNull());
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("action=ROLE_CHANGED"))).toBe(true);
    expect(screen.getByText("Admin B")).toBeInTheDocument();
    expect(screen.getByText("Admin A")).toBeInTheDocument();
    // Back to All actions: the unfiltered list returns.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(await screen.findByText("Admin C")).toBeInTheDocument();
  });
});
