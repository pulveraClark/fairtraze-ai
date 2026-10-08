import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../../router";
import { AppShell } from "./AppShell";
import * as AuthContextModule from "../../context/AuthContext";

vi.mock("../../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});
const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function signInAs(systemRole: "ADMIN" | "INSTRUCTOR" | "STUDENT") {
  mockUseAuth.mockReturnValue({
    user: { id: 1, email: "a@example.com", name: "Alex Doe", systemRole },
    token: "t",
    loading: false,
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  });
}

const classList = [
  { id: 1, subjectCode: "CS101", subjectName: "Intro", assignments: [{ id: 11 }] },
  { id: 2, subjectCode: "CS202", subjectName: "Systems", assignments: [{ id: 22 }] },
];
const summary = [
  { projectId: 5, groupName: "Group Alpha", classId: 1 },
  { projectId: 6, groupName: "Group Beta", classId: 2 },
];

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider><AppShell><main>page body</main></AppShell></RouterProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => {
        if (url === "/api/alerts/unread-count") return { unreadCount: 3 };
        if (url === "/api/classes") return { classes: classList };
        if (url === "/api/projects/summary") return { summary };
        if (url === "/api/student/classes") return { classes: [] };
        return {};
      },
    }))
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AppShell sidebar (instructor)", () => {
  it("auto-expands only the active class and lets others toggle with aria-expanded", async () => {
    signInAs("INSTRUCTOR");
    window.history.pushState({}, "", "/class/1");
    renderShell();
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0];

    expect(await within(nav).findByRole("link", { name: "Group Alpha" })).toBeTruthy();
    expect(within(nav).queryByRole("link", { name: "Group Beta" })).toBeNull();

    const toggle = within(nav).getByRole("button", { name: "Expand Systems" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(toggle);
    expect(within(nav).getByRole("button", { name: "Collapse Systems" }).getAttribute("aria-expanded")).toBe("true");
    expect(await within(nav).findByRole("link", { name: "Group Beta" })).toBeTruthy();
  });

  it("collapses to an icon rail with labelled controls and remembers the choice per user", async () => {
    signInAs("INSTRUCTOR");
    window.history.pushState({}, "", "/dashboard");
    renderShell();
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0];

    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(window.localStorage.getItem("ft_sidebar_collapsed:1")).toBe("1");
    expect(within(nav).getByRole("link", { name: "Disputes" })).toBeTruthy();
    expect(await within(nav).findByRole("button", { name: /Notifications, 3 unread/ })).toBeTruthy();
    // The tree is hidden in the rail.
    expect(within(nav).queryByRole("button", { name: /Expand Intro/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
  });

  it("opens the mobile drawer from the menu button and closes it with Escape, returning focus", async () => {
    signInAs("INSTRUCTOR");
    window.history.pushState({}, "", "/dashboard");
    renderShell();

    const menuButton = screen.getByRole("button", { name: /Open navigation menu/ });
    await userEvent.click(menuButton);
    const dialog = screen.getByRole("dialog", { name: "Main navigation" });
    expect(within(dialog).getByRole("link", { name: /Notifications/ })).toBeTruthy();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Main navigation" })).toBeNull();
    expect(document.activeElement).toBe(menuButton);
  });
});

describe("AppShell sidebar (admin)", () => {
  it("shows flat links and no classes tree", async () => {
    signInAs("ADMIN");
    window.history.pushState({}, "", "/admin");
    renderShell();
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0];
    expect(within(nav).getByRole("link", { name: "Audit log" })).toBeTruthy();
    expect(within(nav).queryByText("Classes")).toBeNull();
    expect(fetch).not.toHaveBeenCalledWith("/api/classes", expect.anything());
  });
});
