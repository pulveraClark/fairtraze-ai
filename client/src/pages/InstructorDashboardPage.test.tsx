import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { InstructorDashboardPage } from "./InstructorDashboardPage";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

beforeEach(() => {
  vi.mocked(AuthContextModule.useAuth).mockReturnValue({
    user: { id: 1, email: "a@example.com", name: "Alex Doe", systemRole: "INSTRUCTOR" },
    token: "t",
    loading: false,
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  } as never);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ classes: [], summary: [] }) })));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("InstructorDashboardPage", () => {
  it("no longer renders the Verify report box (it lives in the sidebar)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider><InstructorDashboardPage /></RouterProvider>
      </QueryClientProvider>
    );
    await screen.findByRole("main");
    expect(screen.queryByLabelText("Report ID on the student's printout")).toBeNull();
    expect(screen.queryByText("Verify report")).toBeNull();
  });
});
