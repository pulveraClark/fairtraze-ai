import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";

describe("AuthContext", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores a session from localStorage when /api/auth/me succeeds", async () => {
    localStorage.setItem("ft_auth_token", "stored-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/auth/me") {
        return new Response(
          JSON.stringify({ id: 1, email: "a@example.com", name: "A", systemRole: "INSTRUCTOR" }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { AuthProvider, useAuth } = await import("./AuthContext");
    function Probe() {
      const { user, loading } = useAuth();
      return <div data-testid="probe">{loading ? "loading" : user ? user.email : "no-user"}</div>;
    }

    const { getByTestId } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(getByTestId("probe").textContent).toBe("a@example.com"));
  });

  it("clears a stored token when /api/auth/me fails", async () => {
    localStorage.setItem("ft_auth_token", "stale-token");
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const { AuthProvider, useAuth } = await import("./AuthContext");
    function Probe() {
      const { user, loading } = useAuth();
      return <div data-testid="probe">{loading ? "loading" : user ? user.email : "no-user"}</div>;
    }

    const { getByTestId } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(getByTestId("probe").textContent).toBe("no-user"));
    expect(localStorage.getItem("ft_auth_token")).toBeNull();
  });

  it("shares a single in-flight /api/auth/refresh call across concurrent 401s", async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/auth/refresh") {
        refreshCalls += 1;
        return new Response(JSON.stringify({ token: "new-token" }), { status: 200 });
      }
      if (url === "/api/protected-a" || url === "/api/protected-b") {
        return new Response(null, { status: 401 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { AuthProvider } = await import("./AuthContext");
    render(
      <AuthProvider>
        <div />
      </AuthProvider>
    );

    // Let the interceptor-install effect run (no initial fetch happens here
    // since there's no stored token to restore a session from).
    await act(async () => {});

    await act(async () => {
      await Promise.all([window.fetch("/api/protected-a"), window.fetch("/api/protected-b")]);
    });

    expect(refreshCalls).toBe(1);
  });
});
