import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouterProvider } from "../router";
import { SystemOverview } from "./SystemOverview";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});
const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function renderAs(systemRole?: "STUDENT" | "INSTRUCTOR" | "ADMIN") {
  mockUseAuth.mockReturnValue({
    user: systemRole ? { id: 1, email: "a@b.c", name: "A", systemRole, instructorStatus: "APPROVED" } : null,
    token: null, loading: false,
    register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
  } as unknown as ReturnType<typeof AuthContextModule.useAuth>);
  return render(<RouterProvider><SystemOverview /></RouterProvider>);
}

afterEach(() => vi.clearAllMocks());

describe("SystemOverview", () => {
  it("states the principle and that outputs are not grades", () => {
    const { container } = renderAs();
    expect(screen.getByText("The math scores. The AI explains. The instructor decides.")).toBeTruthy();
    expect(container.textContent).toMatch(/never assigns a grade/);
  });

  it("shows the real thresholds and Gini bands", () => {
    const { container } = renderAs();
    const t = container.textContent ?? "";
    expect(t).toMatch(/below 0\.5× an equal split/);
    expect(t).toMatch(/above 1\.75× an equal split/);
    expect(t).toMatch(/more than 60% of activity/i);
    expect(t).toMatch(/Gini < 0\.2/);
    expect(t).toMatch(/Gini ≥ 0\.4/);
  });

  it("covers current features and drops stale claims", () => {
    const { container } = renderAs();
    const t = container.textContent ?? "";
    for (const s of ["instructor sign-ups", "Live analysis progress", "fewest open tasks", "project brief", "Merge commits are excluded", "Where the work went"]) {
      expect(t.toLowerCase()).toContain(s.toLowerCase());
    }
    expect(t).not.toMatch(/lorenz/i);
    expect(t).not.toMatch(/per assignment in Scoring Settings/i);
    expect(t).not.toMatch(/per group in Scoring Settings/i);
    expect(t).not.toMatch(/per group/i);
    expect((t.match(/per project \(applies to GitHub and Combined projects\) in Scoring Settings/gi) ?? []).length).toBe(4);
    expect(t).not.toMatch(/Documentation Lead/);
  });

  it("signed-out visitors are pointed to sign in and register", () => {
    renderAs();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Register" })).toBeTruthy();
  });

  it.each([["STUDENT", "Go to my classes"], ["INSTRUCTOR", "Go to dashboard"], ["ADMIN", "Go to admin panel"]] as const)(
    "%s gets a role-aware link", (role, label) => {
      renderAs(role);
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    });
});
