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
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function auth(user: AuthContextModule.AuthUser | null, refreshUser = vi.fn()) {
  vi.mocked(AuthContextModule.useAuth).mockReturnValue({
    user, token: user ? "t" : null, loading: false,
    register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser,
  } as never);
}

/** Routes fetch by URL so each test states only what it cares about. */
function server(handlers: Record<string, (init?: RequestInit) => unknown>) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(handlers).find((k) => String(url).startsWith(k));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    return handlers[key](init);
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const calls = (f: ReturnType<typeof vi.fn>, prefix: string) => f.mock.calls.filter((c) => String(c[0]).startsWith(prefix));

function open(token: string | null = "abc123") {
  window.history.pushState({}, "", token ? `/verify-email?token=${token}` : "/verify-email");
  return render(<RouterProvider><VerifyEmailPage /></RouterProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.pushState({}, "", "/");
});

describe("VerifyEmailPage", () => {
  // AUTH-20, AUTH-40
  it("checks the link first, then one 'Verify my email' press verifies; Continue opens the dashboard and the banner is gone", async () => {
    let current: AuthContextModule.AuthUser = { ...base, emailVerified: false };
    const refreshUser = vi.fn(async () => { current = { ...base, emailVerified: true }; return current; });
    vi.mocked(AuthContextModule.useAuth).mockImplementation(() => ({
      user: current, token: "t", loading: false, register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser,
    }) as never);
    const f = server({
      "/api/auth/verify-email/check": () => json(200, { valid: true }),
      "/api/auth/verify-email": () => json(200, { message: "Email verified" }),
    });

    const before = render(<VerifyEmailBanner />);
    expect(screen.getByRole("button", { name: /resend email/i })).toBeInTheDocument();
    before.unmount();

    open();
    expect(screen.getByText("Checking link…")).toBeInTheDocument();
    const button = await screen.findByRole("button", { name: "Verify my email" });
    // Opening the page only checked: nothing was used up.
    expect(calls(f, "/api/auth/verify-email/check")).toHaveLength(1);
    expect(calls(f, "/api/auth/verify-email").filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")).toHaveLength(0);

    await userEvent.click(button);
    expect(await screen.findByText("Your email has been verified.")).toBeInTheDocument();
    const post = calls(f, "/api/auth/verify-email").find((c) => (c[1] as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ token: "abc123" });
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(window.location.pathname).toBe("/student");
    const after = render(<VerifyEmailBanner />);
    expect(after.container).toBeEmptyDOMElement();
  });

  // AUTH-41
  it("a double click on 'Verify my email' sends one request", async () => {
    auth({ ...base, emailVerified: false });
    let release!: () => void;
    const f = server({
      "/api/auth/verify-email/check": () => json(200, { valid: true }),
      "/api/auth/verify-email": () => new Promise((r) => { release = () => r(json(200, {})); }),
    });
    open();
    const button = await screen.findByRole("button", { name: "Verify my email" });
    await userEvent.dblClick(button);
    release();
    expect(await screen.findByText("Your email has been verified.")).toBeInTheDocument();
    expect(calls(f, "/api/auth/verify-email").filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")).toHaveLength(1);
  });

  // AUTH-42
  it("already verified and signed in: 'Your email is already verified.' with Continue", async () => {
    auth({ ...base, emailVerified: true });
    server({ "/api/auth/verify-email/check": () => json(200, { valid: false }) });
    open("used");
    expect(await screen.findByText("Your email is already verified.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByText("This link expired or was already used.")).not.toBeInTheDocument();
  });

  // AUTH-43
  it("expired or used, signed in and unverified: 'Send a new link' sends once and says check spam too", async () => {
    auth({ ...base, emailVerified: false });
    let release!: () => void;
    const f = server({
      "/api/auth/verify-email/check": () => json(200, { valid: false }),
      "/api/auth/resend-verification": () => new Promise((r) => { release = () => r(json(200, { message: "Verification email sent." })); }),
    });
    open("old");
    expect(await screen.findByText("This link expired or was already used.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify my email" })).not.toBeInTheDocument();

    await userEvent.dblClick(screen.getByRole("button", { name: "Send a new link" }));
    release();
    expect(await screen.findByText("Sent. Check your inbox, and your spam folder too.")).toBeInTheDocument();
    expect(calls(f, "/api/auth/resend-verification")).toHaveLength(1);
    expect((calls(f, "/api/auth/resend-verification")[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer t" });
  });

  // AUTH-44
  it("'Send a new link' shows the 429 text and a send failure message", async () => {
    auth({ ...base, emailVerified: false });
    let status = 429;
    server({
      "/api/auth/verify-email/check": () => json(200, { valid: false }),
      "/api/auth/resend-verification": () => json(status, status === 429
        ? { error: "Too many requests, please try again later." }
        : { error: "Could not send the email. Try again in a minute.", code: "EMAIL_SEND_FAILED" }),
    });
    open("old");
    await userEvent.click(await screen.findByRole("button", { name: "Send a new link" }));
    expect(await screen.findByText("Too many requests. Please wait a few minutes and try again.")).toBeInTheDocument();

    status = 502;
    await userEvent.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(await screen.findByText("Could not send the email. Try again in a minute.")).toBeInTheDocument();
    expect(screen.queryByText(/Sent\./)).not.toBeInTheDocument();
  });

  // AUTH-45
  it("expired or used, signed out: says to sign in, with a Sign in button", async () => {
    auth(null);
    server({ "/api/auth/verify-email/check": () => json(200, { valid: false }) });
    open("old");
    expect(await screen.findByText("This link expired or was already used. Sign in to send a new one.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(window.location.pathname).toBe("/login");
  });

  // AUTH-46
  it("a missing token needs no request and shows the same screen; a failed check offers Try again", async () => {
    auth(null);
    const f = server({});
    const first = open(null);
    expect(await screen.findByText("This link expired or was already used. Sign in to send a new one.")).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
    first.unmount();

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    open("abc");
    expect(await screen.findByText(/couldn't check the link/)).toBeInTheDocument();
    server({ "/api/auth/verify-email/check": () => json(200, { valid: true }) });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Verify my email" })).toBeInTheDocument();
  });

  // AUTH-47
  it("a link used between the check and the press (400) falls to the expired screen, never to success", async () => {
    auth({ ...base, emailVerified: false });
    server({
      "/api/auth/verify-email/check": () => json(200, { valid: true }),
      "/api/auth/verify-email": () => json(400, { error: "This link expired or was already used." }),
    });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Verify my email" }));
    expect(await screen.findByText("This link expired or was already used.")).toBeInTheDocument();
    expect(screen.queryByText("Your email has been verified.")).not.toBeInTheDocument();
  });
});

describe("VerifyEmailBanner", () => {
  // AUTH-48
  it("Resend email ignores a double click and shows the 429 text", async () => {
    auth({ ...base, emailVerified: false });
    let release!: () => void;
    const f = server({
      "/api/auth/resend-verification": () => new Promise((r) => { release = () => r(json(429, { error: "Too many requests, please try again later." })); }),
    });
    render(<VerifyEmailBanner />);
    await userEvent.dblClick(screen.getByRole("button", { name: /resend email/i }));
    release();
    expect(await screen.findByText("Too many requests. Please wait a few minutes and try again.")).toBeInTheDocument();
    expect(f).toHaveBeenCalledTimes(1);
  });
});
