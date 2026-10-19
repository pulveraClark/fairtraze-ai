import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
