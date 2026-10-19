import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { AdminPage } from "./AdminPage";

const users = [
  { id: 1, name: "Admin Self", email: "admin@x.t", systemRole: "ADMIN", githubUsername: null, active: true, lockedUntil: null, createdAt: "2026-08-01T00:00:00Z" },
  { id: 2, name: "Pat Lee", email: "pat@x.t", systemRole: "STUDENT", githubUsername: null, active: true, lockedUntil: null, createdAt: "2026-08-02T00:00:00Z" },
];

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 1, name: "Admin Self", systemRole: "ADMIN" } }),
}));
vi.mock("../hooks/useAdminQueries", () => ({
  useAdminUsersQuery: () => ({ data: { users, total: 2, totalPages: 1, pageSize: 10 }, isLoading: false, isError: false, refetch: vi.fn() }),
  useAdminOverviewQuery: () => ({ data: null, isLoading: false, isError: false }),
  useAdminClassesQuery: () => ({ data: { classes: [], total: 0, totalPages: 1, pageSize: 10 }, isLoading: false, isError: false }),
  useAdminDepartmentsQuery: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("../components/InstructorApprovals", () => ({ InstructorApprovals: () => null }));
vi.mock("../components/DeletionRequests", () => ({ DeletionRequests: () => null }));

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider><AdminPage /></RouterProvider>
    </QueryClientProvider>,
  );
}

describe("AdminPage user rows (16)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("has no trash icon; Delete user is in a ... menu and asks in a dialog before anything is sent", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ message: "Pat Lee deleted." }) }));
    vi.stubGlobal("fetch", fetchFn);
    const confirmSpy = vi.spyOn(window, "confirm");
    renderPage();
    const user = userEvent.setup();
    expect(screen.queryByTitle("Delete user permanently")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More actions for Pat Lee" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete user…" }));
    expect(screen.getByRole("alertdialog", { name: "Delete Pat Lee?" })).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalledWith(expect.stringContaining("/api/admin/users/2"), expect.anything());

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalledWith(expect.stringContaining("/api/admin/users/2"), expect.anything());

    await user.click(screen.getByRole("button", { name: "More actions for Pat Lee" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete user…" }));
    await user.click(screen.getByRole("button", { name: "Delete user" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledWith("/api/admin/users/2", expect.objectContaining({ method: "DELETE" })));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("the signed-in admin's own row has no menu", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "More actions for Admin Self" })).not.toBeInTheDocument();
  });
});
