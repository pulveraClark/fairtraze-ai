import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
const former = { id: 3, name: "Former member", email: "deleted-3@deleted.invalid", systemRole: "STUDENT", githubUsername: null, active: false, lockedUntil: null, createdAt: "2026-08-03T00:00:00Z", deletedAt: "2026-09-01T00:00:00Z" };
const usersQueryCalls: Array<{ includeFormer: boolean }> = [];
let lastParams: Record<string, unknown> = {};

vi.mock("../hooks/useAdminQueries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useAdminQueries")>()),
  useAdminUsersQuery: (_token: string | null, params: { includeFormer: boolean }) => {
    lastParams = params;
    usersQueryCalls.push({ includeFormer: params.includeFormer });
    const shown = params.includeFormer ? [...users, former] : users;
    return { data: { users: shown, total: shown.length, formerCount: 1, totalPages: 1, pageSize: 10 }, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useAdminOverviewQuery: () => ({ data: null, isLoading: false, isError: false }),
  useAdminDepartmentsQuery: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("../components/InstructorApprovals", () => ({ InstructorApprovals: () => null }));
vi.mock("../components/DeletionRequests", () => ({ DeletionRequests: () => null }));

// The list keeps its filters in the URL, so each test starts from a clean one.
beforeEach(() => window.history.replaceState({}, "", "/"));

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

describe("AdminPage former members", () => {
  it("hides them by default, shows the count toggle, and requests includeFormer when switched on", async () => {
    renderPage();
    const user = userEvent.setup();
    expect(screen.getByText("2 users")).toBeInTheDocument();
    expect(screen.queryByText("Deleted account")).not.toBeInTheDocument();
    expect(usersQueryCalls.at(-1)).toEqual({ includeFormer: false });

    await user.click(screen.getByRole("checkbox", { name: "Show former members (1)" }));
    expect(usersQueryCalls.at(-1)).toEqual({ includeFormer: true });
    expect(screen.getByText("3 users")).toBeInTheDocument();
  });

  it("shows a former member as 'Deleted account' with no role select, Activate button or menu", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Show former members (1)" }));
    const row = screen.getByText("Former member").closest("tr")!;
    expect(within(row).getByText("Deleted account")).toBeInTheDocument();
    expect(within(row).queryByTitle("Change role")).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Activate" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /More actions/ })).not.toBeInTheDocument();
  });
});

describe("AdminPage role and status changes ask in a dialog", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("role change: ConfirmDialog, no window.confirm; Cancel sends nothing, Confirm PATCHes", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ ...users[1], systemRole: "INSTRUCTOR" }) }));
    vi.stubGlobal("fetch", fetchFn);
    const confirmSpy = vi.spyOn(window, "confirm");
    renderPage();
    const user = userEvent.setup();
    const selects = screen.getAllByTitle("Change role");
    await user.selectOptions(selects[selects.length - 1], "INSTRUCTOR");
    expect(screen.getByRole("alertdialog", { name: "Change Pat Lee's role?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchFn).not.toHaveBeenCalledWith("/api/admin/users/2/role", expect.anything());

    await user.selectOptions(screen.getAllByTitle("Change role").at(-1)!, "INSTRUCTOR");
    await user.click(screen.getByRole("button", { name: "Change role" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledWith("/api/admin/users/2/role", expect.objectContaining({ method: "PATCH" })));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("deactivate: ConfirmDialog first, then PATCH", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ ...users[1], active: false }) }));
    vi.stubGlobal("fetch", fetchFn);
    const confirmSpy = vi.spyOn(window, "confirm");
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getAllByTitle("Deactivate account").at(-1)!);
    expect(screen.getByRole("alertdialog", { name: "Deactivate Pat Lee?" })).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalledWith("/api/admin/users/2/status", expect.anything());
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledWith("/api/admin/users/2/status", expect.objectContaining({ method: "PATCH" })));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe("AdminPage filters, sort and URL", () => {
  afterEach(() => { window.history.replaceState({}, "", "/"); vi.unstubAllGlobals(); });

  it("status and last-active filters reach the query and the URL; the page resets to 1", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by status" }), "inactive");
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by last active" }), "30d");
    expect(lastParams).toMatchObject({ status: "inactive", lastActive: "30d", page: 1 });
    await waitFor(() => expect(window.location.search).toBe("?status=inactive&active=30d"));
  });

  it("starts from the URL (shared link / reload)", () => {
    window.history.replaceState({}, "", "/admin?role=STUDENT&status=active&sort=name&dir=asc&section=instructor-approvals");
    renderPage();
    expect(lastParams).toMatchObject({ roleFilter: "STUDENT", status: "active", sort: "name", dir: "asc" });
    expect(screen.getByRole("combobox", { name: "Filter by role" })).toHaveValue("STUDENT");
    expect(window.location.search).toContain("section=instructor-approvals");
  });

  it("column headers sort, flip direction, and expose aria-sort", async () => {
    renderPage();
    const user = userEvent.setup();
    const lastActiveTh = () => screen.getByRole("columnheader", { name: /Last active/ });
    expect(screen.getByRole("columnheader", { name: /Joined/ })).toHaveAttribute("aria-sort", "descending");
    await user.click(within(lastActiveTh()).getByRole("button"));
    expect(lastParams).toMatchObject({ sort: "lastActive", dir: "desc" });
    expect(lastActiveTh()).toHaveAttribute("aria-sort", "descending");
    await user.click(within(lastActiveTh()).getByRole("button"));
    expect(lastParams).toMatchObject({ sort: "lastActive", dir: "asc" });
    await user.click(within(screen.getByRole("columnheader", { name: /Name/ })).getByRole("button"));
    expect(lastParams).toMatchObject({ sort: "name", dir: "asc" });
  });

  it("pressing / focuses search, but not while typing in a field or with a dialog open", async () => {
    renderPage();
    const user = userEvent.setup();
    const search = screen.getByRole("searchbox", { name: /Search users/ });
    await user.keyboard("/");
    expect(search).toHaveFocus();
    expect(search).toHaveValue("");

    screen.getByRole("combobox", { name: "Filter by role" }).focus();
    await user.keyboard("/");
    expect(search).not.toHaveFocus();
  });
});
