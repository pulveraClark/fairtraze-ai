import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { RouterProvider } from "../router";
import { ProtectedRoute } from "./ProtectedRoute";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function renderProtected(allowedRoles?: ("ADMIN" | "INSTRUCTOR" | "STUDENT")[]) {
  return render(
    <RouterProvider>
      <ProtectedRoute allowedRoles={allowedRoles}>
        <div data-testid="protected-content">secret</div>
      </ProtectedRoute>
    </RouterProvider>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/dashboard");
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when a user is present and no role restriction applies", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: "a@example.com", name: "A", systemRole: "INSTRUCTOR" },
      token: "t",
      loading: false,
      register: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    const { findByTestId } = renderProtected();
    expect(await findByTestId("protected-content")).toBeInTheDocument();
  });

  it("redirects to /login and remembers the intended path when there is no user", async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      loading: false,
      register: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderProtected();

    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(localStorage.getItem("ft_next")).toBe("/dashboard");
  });

  it("redirects a STUDENT away from an INSTRUCTOR-only route to their role home", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 2, email: "s@example.com", name: "S", systemRole: "STUDENT" },
      token: "t",
      loading: false,
      register: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderProtected(["INSTRUCTOR"]);

    await waitFor(() => expect(window.location.pathname).toBe("/student"));
  });

  it("shows a loading state and does not redirect while auth is still resolving", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      loading: true,
      register: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderProtected();
    expect(window.location.pathname).toBe("/dashboard");
  });
});
