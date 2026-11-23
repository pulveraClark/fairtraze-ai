import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { ToastProvider } from "../components/Toast";
import { AdminPage } from "./AdminPage";

// The departments list uses the REAL useAdminDepartmentsQuery here (AdminPage.test.tsx stubs it
// with an empty list); only the users list and the sibling cards are stubbed.
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 1, name: "Admin Self", systemRole: "ADMIN" } }),
}));
vi.mock("../hooks/useAdminQueries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useAdminQueries")>()),
  useAdminUsersQuery: () => ({ data: { users: [], total: 0, formerCount: 0, totalPages: 1, pageSize: 10 }, isLoading: false, isError: false, refetch: vi.fn() }),
  useAdminOverviewQuery: () => ({ data: null, isLoading: false, isError: false }),
}));
vi.mock("../components/InstructorApprovals", () => ({ InstructorApprovals: () => null }));
vi.mock("../components/DeletionRequests", () => ({ DeletionRequests: () => null }));
vi.mock("../components/EdpCodeTool", () => ({ EdpCodeTool: () => null }));

beforeEach(() => window.history.replaceState({}, "", "/"));
afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 201) => ({ ok: status < 400, status, json: async () => body });

describe("AdminPage departments", () => {
  // ADM-08
  it("creating a department with a name and a code adds it to the Departments list", async () => {
    const created: Array<{ id: number; name: string; code: string; createdAt: string; _count: { classSections: number } }> = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/departments" && init?.method === "POST") {
        const body = JSON.parse(init.body as string) as { name: string; code: string };
        created.push({ id: 7, name: body.name, code: body.code, createdAt: "2026-11-20T00:00:00Z", _count: { classSections: 0 } });
        return json({ id: 7, name: body.name, code: body.code });
      }
      if (url === "/api/admin/departments") return json({ departments: created }, 200);
      return json({}, 200);
    });
    vi.stubGlobal("fetch", f);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider><RouterProvider><AdminPage /></RouterProvider></ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("No departments yet.")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+ New" }));
    await user.type(screen.getByPlaceholderText("e.g. College of Computer Studies"), "College of Engineering");
    await user.type(screen.getByPlaceholderText("e.g. CCS"), "COE");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText('Department "College of Engineering" created.')).toBeInTheDocument();
    const post = f.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({ name: "College of Engineering", code: "COE" });

    // Listed with its name and code, and the empty message is gone.
    expect(await screen.findByText("College of Engineering")).toBeInTheDocument();
    expect(screen.getByText("COE")).toBeInTheDocument();
    expect(screen.queryByText("No departments yet.")).not.toBeInTheDocument();
  });
});
