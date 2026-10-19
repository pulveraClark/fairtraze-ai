import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { DisputesPage } from "./DisputesPage";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 9, name: "Prof", systemRole: "INSTRUCTOR" } }),
}));
vi.mock("../hooks/useInvalidateOnAlertCount", () => ({ useInvalidateOnAlertCount: () => undefined }));
vi.mock("../hooks/useSharedQueries", () => ({ useClassesListQuery: () => ({ data: [] }) }));
vi.mock("../components/Toast", () => ({ useToast: () => ({ show: vi.fn(), toast: vi.fn() }) }));

describe("DisputesPage", () => {
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
