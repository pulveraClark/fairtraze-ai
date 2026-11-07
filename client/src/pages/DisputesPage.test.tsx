import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { DisputesPage } from "./DisputesPage";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 9, name: "Prof", systemRole: "INSTRUCTOR" } }),
}));
vi.mock("../hooks/useInvalidateOnAlertCount", () => ({ useInvalidateOnAlertCount: () => undefined }));
const classes = vi.hoisted(() => ({
  list: [] as { id: number; subjectCode: string; subjectName: string; edpCode: string }[],
}));
vi.mock("../hooks/useSharedQueries", () => ({ useClassesListQuery: () => ({ data: classes.list }) }));
vi.mock("../components/Toast", () => ({ useToast: () => ({ show: vi.fn(), toast: vi.fn() }) }));

function renderPage() {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ disputes: [], openCount: 0 }) })));
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider><DisputesPage /></RouterProvider>
    </QueryClientProvider>,
  );
}

describe("DisputesPage", () => {
  it("the class select never grows wider than a 375px screen (I29)", async () => {
    classes.list = [{ id: 1, subjectCode: "UXA-101", subjectName: "A very long subject name that would push the select past a phone screen", edpCode: "12345" }];
    renderPage();
    const select = await screen.findByRole("combobox");
    expect(select).toHaveClass("w-full", "max-w-full", "min-w-0");
    classes.list = [];
  });

  it("has no 'Back to Dashboard' link; sidebar and breadcrumb cover it (R6)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ disputes: [], openCount: 0 }) })));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider><DisputesPage /></RouterProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole("heading", { name: "Disputes" });
    expect(screen.queryByText(/back to dashboard/i)).toBeNull();
  });

  it("opening the response window marks the note as seen, once, with no extra click", async () => {
    const open = {
      id: 5, memberName: "Ana", reason: "Offline work.", status: "OPEN", instructorResponse: null, disputedFlags: [],
      createdAt: "2026-10-18T10:00:00Z", seenAt: null, resolvedAt: null,
      project: { id: 3, groupName: "Group A", name: "App", assignment: null },
    };
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => (String(url).includes("/seen") ? { seenAt: "2026-10-19T10:00:00Z" } : { disputes: [open], openCount: 1 }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider><DisputesPage /></RouterProvider>
      </QueryClientProvider>,
    );
    const seenCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/disputes/5/seen"));
    const button = await screen.findByRole("button", { name: /Respond/ });
    expect(seenCalls()).toHaveLength(0);
    fireEvent.click(button);
    await waitFor(() => expect(seenCalls()).toHaveLength(1));
    expect(fetchMock.mock.calls.find(([u]) => String(u).includes("/seen"))![1]).toMatchObject({ method: "POST" });
  });
});
