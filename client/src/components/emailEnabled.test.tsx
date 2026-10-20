import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "../router";
import { VerifyEmailBanner } from "./VerifyEmailBanner";
import { EmailOnlyRoute } from "./EmailOnlyRoute";
import { LoginPage } from "../pages/LoginPage";
import { resetEmailEnabledCache } from "../lib/useEmailEnabled";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

function mockAuth(user: AuthContextModule.AuthUser | null) {
  vi.mocked(AuthContextModule.useAuth).mockReturnValue({
    user, token: user ? "t" : null, loading: false,
    register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
  });
}

function mockConfig(emailEnabled: boolean) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ emailEnabled }) }));
}

const unverified: AuthContextModule.AuthUser = {
  id: 1, email: "a@b.c", name: "A", systemRole: "STUDENT", emailVerified: false, emailVerificationRequired: true,
};

beforeEach(() => resetEmailEnabledCache());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.pushState({}, "", "/");
});

describe("VerifyEmailBanner", () => {
  it("shows the banner and Resend email when email is on", () => {
    mockAuth(unverified);
    render(<VerifyEmailBanner />);
    expect(screen.getByRole("button", { name: /resend email/i })).toBeInTheDocument();
  });

  it("shows nothing when the server has email off", () => {
    mockAuth({ ...unverified, emailEnabled: false });
    const { container } = render(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Login page 'Forgot password?'", () => {
  it("is shown when email is on", async () => {
    mockAuth(null);
    mockConfig(true);
    render(<RouterProvider><LoginPage /></RouterProvider>);
    expect(await screen.findByRole("button", { name: "Forgot password?" })).toBeInTheDocument();
  });

  it("is hidden when email is off, and the password field is still there", async () => {
    mockAuth(null);
    mockConfig(false);
    render(<RouterProvider><LoginPage /></RouterProvider>);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Forgot password?" })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });
});

describe("EmailOnlyRoute", () => {
  it("renders the page when email is on", async () => {
    mockConfig(true);
    window.history.pushState({}, "", "/forgot-password");
    render(<RouterProvider><EmailOnlyRoute><p>reset form</p></EmailOnlyRoute></RouterProvider>);
    expect(await screen.findByText("reset form")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/forgot-password");
  });

  it("sends the visitor to /login and renders nothing when email is off", async () => {
    mockConfig(false);
    window.history.pushState({}, "", "/forgot-password");
    render(<RouterProvider><EmailOnlyRoute><p>reset form</p></EmailOnlyRoute></RouterProvider>);
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(screen.queryByText("reset form")).not.toBeInTheDocument();
  });
});
