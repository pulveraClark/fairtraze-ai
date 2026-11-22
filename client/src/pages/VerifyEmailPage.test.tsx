import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "../router";
import { VerifyEmailPage } from "./VerifyEmailPage";
import { VerifyEmailBanner } from "../components/VerifyEmailBanner";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

const base = { id: 1, email: "a@b.c", name: "A", systemRole: "STUDENT" as const, emailVerificationRequired: true };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.pushState({}, "", "/");
});

describe("VerifyEmailPage", () => {
  // AUTH-20
  it("shows 'Your email has been verified.', Continue opens the dashboard, and the banner is gone", async () => {
    window.history.pushState({}, "", "/verify-email?token=abc123");
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "Email verified" }) });
    vi.stubGlobal("fetch", f);

    // The session starts unverified; refreshUser() is what the page calls once the link worked.
    let user: AuthContextModule.AuthUser = { ...base, emailVerified: false };
    const refreshUser = vi.fn(async () => { user = { ...base, emailVerified: true }; return user; });
    const auth = () => ({
      user, token: "t", loading: false,
      register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser,
    });
    vi.mocked(AuthContextModule.useAuth).mockImplementation(auth);

    // Before: the dashboard banner is showing for this unverified user.
    const before = render(<VerifyEmailBanner />);
    expect(screen.getByRole("button", { name: /resend email/i })).toBeInTheDocument();
    before.unmount();

    render(<RouterProvider><VerifyEmailPage /></RouterProvider>);
    expect(await screen.findByText("Your email has been verified.")).toBeInTheDocument();
    expect(f.mock.calls[0][0]).toBe("/api/auth/verify-email");
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ token: "abc123" });
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(window.location.pathname).toBe("/student");

    // After: with the refreshed user the banner renders nothing.
    const after = render(<VerifyEmailBanner />);
    expect(after.container).toBeEmptyDOMElement();
  });

  it("an invalid or used link shows the server's message, not the success text", async () => {
    window.history.pushState({}, "", "/verify-email?token=old");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "This verification link is invalid or has expired." }) }));
    vi.mocked(AuthContextModule.useAuth).mockReturnValue({
      user: { ...base, emailVerified: false }, token: "t", loading: false,
      register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
    });
    render(<RouterProvider><VerifyEmailPage /></RouterProvider>);
    expect(await screen.findByText("This verification link is invalid or has expired.")).toBeInTheDocument();
    expect(screen.queryByText("Your email has been verified.")).not.toBeInTheDocument();
  });
});
