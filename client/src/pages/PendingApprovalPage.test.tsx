import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouterProvider } from "../router";
import { PendingApprovalPage } from "./PendingApprovalPage";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function renderWith(instructorStatus: "PENDING" | "REJECTED") {
  mockUseAuth.mockReturnValue({
    user: { id: 1, email: "i@example.com", name: "I", systemRole: "INSTRUCTOR", instructorStatus },
    token: "t",
    loading: false,
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  });
  return render(
    <RouterProvider>
      <PendingApprovalPage />
    </RouterProvider>
  );
}

describe("PendingApprovalPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("tells a pending instructor the account is waiting for approval", () => {
    renderWith("PENDING");
    expect(screen.getByText(/waiting for admin approval/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check status" })).toBeInTheDocument();
  });

  it("tells a rejected instructor to contact their administrator", () => {
    renderWith("REJECTED");
    expect(screen.getByText("Your instructor request was not approved. Contact your administrator.")).toBeInTheDocument();
  });
});
