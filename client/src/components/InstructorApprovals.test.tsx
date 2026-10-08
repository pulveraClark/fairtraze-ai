import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InstructorApprovals } from "./InstructorApprovals";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

vi.mocked(AuthContextModule.useAuth).mockReturnValue({
  user: { id: 9, email: "a@example.com", name: "Admin", systemRole: "ADMIN" },
  token: "t",
  loading: false,
  register: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
});

function renderApprovals() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InstructorApprovals />
    </QueryClientProvider>
  );
}

function mockFetch(data: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => data }) as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("InstructorApprovals", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows an empty state when nobody is waiting", async () => {
    mockFetch({ pendingCount: 0, pending: [], recent: [] });
    renderApprovals();
    expect(await screen.findByText("No instructors are waiting for approval")).toBeInTheDocument();
  });

  it("lists pending instructors with a count and approves one", async () => {
    const fetchFn = mockFetch({
      pendingCount: 1,
      pending: [{ id: 5, name: "Pat Lee", email: "pat@example.com", createdAt: "2026-10-01T00:00:00.000Z" }],
      recent: [{ id: 6, name: "Sam Roe", email: "sam@example.com", status: "REJECTED", reviewedAt: "2026-10-02T00:00:00.000Z", reviewedByName: "Admin" }],
    });
    renderApprovals();

    expect(await screen.findByText("Pat Lee")).toBeInTheDocument();
    expect(screen.getByLabelText("1 waiting for approval")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Approve Pat Lee" }));
    await waitFor(() =>
      expect(fetchFn).toHaveBeenCalledWith("/api/admin/instructor-approvals/5/approve", expect.objectContaining({ method: "POST" })),
    );
  });
});
