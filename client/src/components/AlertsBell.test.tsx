import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { AlertsBell } from "./AlertsBell";
import { alertLink, alertMeta } from "../hooks/useAlerts";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function signInAs(systemRole: "ADMIN" | "INSTRUCTOR" | "STUDENT") {
  mockUseAuth.mockReturnValue({
    user: { id: 1, email: "a@example.com", name: "A", systemRole },
    token: "t",
    loading: false,
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  });
}

function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider><AlertsBell /></RouterProvider>
    </QueryClientProvider>
  );
}

const studentAlert = {
  id: 7,
  projectId: 3,
  type: "JOIN_REQUEST_RECEIVED",
  message: "Requester One requested to join Group A",
  teamHealth: null,
  link: "/student/group/3?manage=1",
  read: false,
  createdAt: new Date().toISOString(),
  project: null,
};

describe("AlertsBell for non-instructor roles", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/student");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url === "/api/alerts/unread-count" ? { unreadCount: 1 } : { alerts: [studentAlert], unreadCount: 1 },
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each(["STUDENT", "ADMIN"] as const)("fetches and shows notifications for a %s", async (role) => {
    signInAs(role);
    renderBell();

    expect(await screen.findByRole("button", { name: /1 unread/ })).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/alerts/unread-count", expect.anything());
    // The full list is not fetched until the dropdown opens.
    expect(fetch).not.toHaveBeenCalledWith("/api/alerts", expect.anything());

    await userEvent.click(screen.getByRole("button", { name: /1 unread/ }));
    expect(await screen.findByText("Requester One requested to join Group A")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/alerts", expect.anything());
    expect(screen.getByText("Join Request")).toBeTruthy();
  });

  it("navigates via the stored role-correct link and marks the notification read", async () => {
    signInAs("STUDENT");
    renderBell();

    await userEvent.click(await screen.findByRole("button", { name: /1 unread/ }));
    await userEvent.click(await screen.findByText("Requester One requested to join Group A"));

    await waitFor(() => expect(window.location.pathname).toBe("/student/group/3"));
    expect(window.location.search).toBe("?manage=1");
    expect(fetch).toHaveBeenCalledWith("/api/alerts/7/read", expect.objectContaining({ method: "POST" }));
  });
});

describe("AlertsBell flyout stays on screen (22)", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("caps its height to the space below it in a short window and scrolls the list inside", async () => {
    signInAs("INSTRUCTOR");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === "/api/alerts/unread-count" ? { unreadCount: 1 } : { alerts: [studentAlert], unreadCount: 1 }),
    })));
    const innerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 400 });
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 300, right: 240, bottom: 340, left: 0, width: 240, height: 40, x: 0, y: 300, toJSON: () => ({}) });
    try {
      renderBell();
      await userEvent.click(await screen.findByRole("button", { name: /1 unread/ }));
      const dialog = await screen.findByRole("dialog", { name: "Notifications" });
      const top = parseFloat(dialog.style.top);
      const maxHeight = parseFloat(dialog.style.maxHeight);
      expect(top).toBeGreaterThanOrEqual(8);
      expect(top + maxHeight).toBeLessThanOrEqual(400 - 8);
      expect(dialog.querySelector(".overflow-y-auto")).not.toBeNull();
    } finally {
      rect.mockRestore();
      Object.defineProperty(window, "innerHeight", { configurable: true, value: innerHeight });
    }
  });
});

describe("alertLink / alertMeta", () => {
  it("prefers the stored link", () => {
    expect(alertLink({ type: "TASK_ASSIGNED", link: "/student/group/9", projectId: 9 })).toBe("/student/group/9");
  });

  it("falls back to the legacy instructor destinations when no link is stored", () => {
    expect(alertLink({ type: "DISPUTE_FILED", link: null, projectId: 2 })).toBe("/disputes");
    expect(alertLink({ type: "HIGH_RISK", link: null, projectId: 2 })).toBe("/project/2");
    expect(alertLink({ type: "ACCOUNT_LOCKED", link: null, projectId: null })).toBeNull();
  });

  it("never throws on an unknown type", () => {
    expect(alertMeta("SOMETHING_NEW").label).toBe("Notification");
  });
});
