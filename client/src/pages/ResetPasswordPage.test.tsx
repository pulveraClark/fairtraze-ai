import { StrictMode } from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "../router";
import { ResetPasswordPage } from "./ResetPasswordPage";

const fetchMock = vi.fn();

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const CHECK_VALID: Reply = { ok: true, status: 200, json: async () => ({ valid: true }) };
const CHECK_INVALID: Reply = { ok: true, status: 200, json: async () => ({ valid: false }) };

/** Answers the link check with `check` and every reset POST with `reset` (the real page makes both calls). */
function mockServer(reset: Reply | (() => Promise<Reply>), check: Reply = CHECK_VALID) {
  fetchMock.mockImplementation(async (url: string) =>
    url.startsWith("/api/auth/reset-password/check") ? check : typeof reset === "function" ? reset() : reset,
  );
}
const resetCalls = () => fetchMock.mock.calls.filter(([u]) => u === "/api/auth/reset-password");

function renderPage(search = "?token=abc123") {
  window.history.pushState({}, "", `/reset-password${search}`);
  return render(
    <RouterProvider>
      <ResetPasswordPage />
    </RouterProvider>,
  );
}

async function fill(password: string, confirm = password) {
  await screen.findByLabelText("New password");
  await userEvent.type(screen.getByLabelText("New password"), password);
  await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("with no token shows the missing-link message and a Request a new link button", async () => {
    renderPage("");
    expect(screen.getByText(/missing a token/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Request a new link" }));
    expect(window.location.pathname).toBe("/forgot-password");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // AUTH-17
  it("checks length and match in the browser before calling the server", async () => {
    mockServer({ ok: true, status: 200, json: async () => ({}) });
    renderPage();
    await fill("short");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("New password"));
    await userEvent.clear(screen.getByLabelText("Confirm new password"));
    await fill("password123", "password124");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(resetCalls()).toHaveLength(0);
  });

  it("show/hide switches both password fields between hidden and visible", async () => {
    mockServer({ ok: true, status: 200, json: async () => ({}) });
    renderPage();
    const pw = (await screen.findByLabelText("New password")) as HTMLInputElement;
    const confirm = screen.getByLabelText("Confirm new password") as HTMLInputElement;
    expect(pw.type).toBe("password");
    expect(confirm.type).toBe("password");

    await userEvent.click(screen.getByRole("button", { name: "Show passwords" }));
    expect(pw.type).toBe("text");
    expect(confirm.type).toBe("text");

    await userEvent.click(screen.getByRole("button", { name: "Hide passwords" }));
    expect(pw.type).toBe("password");
  });

  it("sends the token and the new password, then shows the success message", async () => {
    mockServer({ ok: true, status: 200, json: async () => ({ message: "ok" }) });
    renderPage("?token=abc123");
    await fill("password123");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    const [url, init] = resetCalls()[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/reset-password");
    expect(JSON.parse(init.body as string)).toEqual({ token: "abc123", newPassword: "password123" });

    expect(await screen.findByText(/Password reset successful/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to sign in" }));
    expect(window.location.pathname).toBe("/login");
  });

  // AUTH-18
  it("on a 400 (expired or used link) shows the plain message and Request a new link", async () => {
    // The check said valid (link used between the check and the submit), so the 400 comes from the submit.
    mockServer({ ok: false, status: 400, json: async () => ({ error: "This reset link is invalid or has expired." }) });
    renderPage("?token=old");
    await fill("password123");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("This link expired or was already used.")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Request a new link" }));
    expect(window.location.pathname).toBe("/forgot-password");
  });

  it("on another failure keeps the form and shows the error", async () => {
    mockServer({ ok: false, status: 429, json: async () => ({ error: "Too many requests" }) });
    renderPage("?token=abc123");
    await fill("password123");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Too many attempts. Please wait a few minutes and try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("shows the used-link message on open, with no submit, and offers a new link", async () => {
    mockServer({ ok: true, status: 200, json: async () => ({}) }, CHECK_INVALID);
    renderPage("?token=used");
    expect(await screen.findByText("This link expired or was already used.")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(resetCalls()).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Request a new link" }));
    expect(window.location.pathname).toBe("/forgot-password");
  });

  it("shows 'Checking link…' first, then the form for a valid link, after one check call", async () => {
    let answer: (r: Reply) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Reply>((resolve) => { answer = resolve; }));
    renderPage("?token=good%20one");
    expect(screen.getByText("Checking link…")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    answer(CHECK_VALID);
    expect(await screen.findByLabelText("New password")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/reset-password/check?token=good%20one");
  });

  it("makes one check call under StrictMode", async () => {
    mockServer({ ok: true, status: 200, json: async () => ({}) });
    window.history.pushState({}, "", "/reset-password?token=abc123");
    render(
      <StrictMode>
        <RouterProvider>
          <ResetPasswordPage />
        </RouterProvider>
      </StrictMode>,
    );
    expect(await screen.findByLabelText("New password")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still shows the form when the check itself fails (the submit decides)", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    renderPage("?token=abc123");
    expect(await screen.findByLabelText("New password")).toBeInTheDocument();
  });

  it("a double Enter sends one reset request", async () => {
    let release: () => void = () => {};
    mockServer(() => new Promise<Reply>((resolve) => {
      release = () => resolve({ ok: true, status: 200, json: async () => ({ message: "ok" }) });
    }));
    renderPage("?token=abc123");
    await fill("password123");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "{Enter}{Enter}");
    expect(resetCalls()).toHaveLength(1);
    release();
    expect(await screen.findByText(/Password reset successful/)).toBeInTheDocument();
    expect(resetCalls()).toHaveLength(1);
  });

  it("success wins over a link problem: a 200 followed by a 400 never shows 'already used'", async () => {
    // Two submits that both reach the server (as if the guard were bypassed): first 200, second 400.
    const replies: Reply[] = [
      { ok: true, status: 200, json: async () => ({ message: "ok" }) },
      { ok: false, status: 400, json: async () => ({ error: "This reset link is invalid or has expired." }) },
    ];
    let n = 0;
    mockServer(async () => replies[Math.min(n++, 1)]);
    renderPage("?token=abc123");
    await fill("password123");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByText(/Password reset successful/)).toBeInTheDocument();
    expect(screen.queryByText("This link expired or was already used.")).not.toBeInTheDocument();
  });
});
