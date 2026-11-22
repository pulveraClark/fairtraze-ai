import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { AlertsPage } from "./AlertsPage";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 9, name: "Prof", systemRole: "INSTRUCTOR" } }),
}));

afterEach(() => vi.unstubAllGlobals());

const TOTAL = 45;
const PAGE_SIZE = 20;

function alertRow(n: number) {
  return {
    id: n, projectId: null, type: "DISPUTE_FILED", message: `Notification number ${n}`, teamHealth: null,
    link: null, read: true, createdAt: "2026-11-20T00:00:00Z", project: null,
  };
}

/** A server that answers /api/alerts?page=&pageSize= the way routes/alerts.ts does, for TOTAL rows. */
function stubServer(total: number) {
  const f = vi.fn(async (url: string) => {
    const q = new URL(url, "http://x").searchParams;
    const page = Number(q.get("page") ?? 1);
    const pageSize = Number(q.get("pageSize") ?? PAGE_SIZE);
    const first = (page - 1) * pageSize + 1;
    const last = Math.min(page * pageSize, total);
    const alerts = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => alertRow(first + i));
    return { ok: true, json: async () => ({ alerts, unreadCount: 0, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) }) };
  });
  vi.stubGlobal("fetch", f);
  return f;
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider><AlertsPage /></RouterProvider>
    </QueryClientProvider>,
  );
}

const shown = () => screen.queryAllByText(/^Notification number \d+$/).map((e) => e.textContent);

describe("AlertsPage (Notifications) paging", () => {
  // DSP-11 (Notifications paging)
  it("shows 20 per page; Next shows the next ones, Prev returns to the first page", async () => {
    const f = stubServer(TOTAL);
    renderPage();

    expect(await screen.findByText("Notification number 1")).toBeInTheDocument();
    expect(shown()).toHaveLength(20);
    expect(shown()[0]).toBe("Notification number 1");
    expect(shown()[19]).toBe("Notification number 20");
    expect(screen.getByText("1–20 of 45 notifications")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Prev/ })).toBeDisabled();
    expect(String(f.mock.calls[0][0])).toContain("pageSize=20");

    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(await screen.findByText("Notification number 21")).toBeInTheDocument();
    expect(shown()).toHaveLength(20);
    expect(shown()[19]).toBe("Notification number 40");
    expect(screen.queryByText("Notification number 1")).toBeNull();
    expect(screen.getByText("21–40 of 45 notifications")).toBeInTheDocument();
    expect(f.mock.calls.some(([u]) => String(u).includes("page=2"))).toBe(true);
    expect(screen.getByRole("button", { name: /Prev/ })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /Prev/ }));
    expect(await screen.findByText("Notification number 1")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Prev/ })).toBeDisabled();
  });

  // DSP-11 (Notifications paging)
  it("an empty list shows a friendly message and no page buttons", async () => {
    stubServer(0);
    renderPage();
    expect(await screen.findByText("No notifications")).toBeInTheDocument();
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Prev/ })).toBeNull();
  });
});
