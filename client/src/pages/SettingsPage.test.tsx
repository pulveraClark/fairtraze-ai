import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "../router";
import { SettingsPage } from "./SettingsPage";

const profile = {
  id: 1, email: "ana@example.test", name: "Ana Cruz", systemRole: "STUDENT", githubUsername: "anacruz",
  avatarUpdatedAt: null, createdAt: "2026-08-01T00:00:00Z",
};

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    token: "t", refreshUser: vi.fn(), logout: vi.fn(),
    user: { id: 1, name: "Ana Cruz", systemRole: "STUDENT", consentVersion: "1.1" },
  }),
  useAuthOptional: () => null,
}));
vi.mock("../components/ProfilePhotoControls", () => ({ ProfilePhotoControls: () => null }));

function renderPage() {
  return render(<RouterProvider><SettingsPage /></RouterProvider>);
}

describe("SettingsPage", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/settings");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => profile })));
  });

  it("shows email, role and GitHub username once each (R5)", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText("ana@example.test").length).toBeGreaterThan(0));
    expect(screen.getAllByText("ana@example.test")).toHaveLength(1);
    expect(screen.getAllByText("Student")).toHaveLength(1);
    expect(screen.getAllByText(/anacruz/)).toHaveLength(1);
    expect(screen.getAllByText("Download my data")).toHaveLength(1);
  });

  it("opens the profile editor on the GitHub username field for /settings?edit=github", async () => {
    window.history.pushState({}, "", "/settings?edit=github");
    renderPage();
    const field = await screen.findByLabelText("GitHub username");
    expect(field).toHaveFocus();
  });

  it("has no Dashboard back button; the sidebar and breadcrumb remain (R6)", async () => {
    renderPage();
    await screen.findAllByText("Ana Cruz");
    expect(screen.queryByRole("button", { name: /dashboard/i })).toBeNull();
  });
});
