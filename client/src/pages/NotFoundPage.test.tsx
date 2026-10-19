import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "../router";
import { NotFoundPage } from "./NotFoundPage";
import { NoCodeView } from "./JoinPage";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});
const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function auth(user: AuthContextModule.AuthUser | null) {
  mockUseAuth.mockReturnValue({
    user, token: user ? "t" : null, loading: false,
    register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
  } as unknown as ReturnType<typeof AuthContextModule.useAuth>);
}

describe("NotFoundPage", () => {
  afterEach(() => { vi.clearAllMocks(); window.history.replaceState({}, "", "/"); });

  it("sends a signed-in student to their dashboard", async () => {
    auth({ id: 1, email: "s@x.com", name: "S", systemRole: "STUDENT" } as AuthContextModule.AuthUser);
    render(<RouterProvider><NotFoundPage /></RouterProvider>);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to your dashboard" }));
    expect(window.location.pathname).toBe("/student");
  });

  it("sends a visitor who is not signed in to the home page", async () => {
    auth(null);
    window.history.replaceState({}, "", "/nope");
    render(<RouterProvider><NotFoundPage /></RouterProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Go to the home page" }));
    expect(window.location.pathname).toBe("/");
  });
});

describe("NoCodeView", () => {
  it("explains a join code and submits a pasted one", async () => {
    const onSubmit = vi.fn();
    render(<NoCodeView onSubmit={onSubmit} onHome={vi.fn()} homeLabel="Back to home" />);
    expect(screen.getByText(/join code is a short code/i)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Join class" });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Join code"), "  ABC123 ");
    await userEvent.click(button);
    expect(onSubmit).toHaveBeenCalledWith("ABC123");
  });
});
