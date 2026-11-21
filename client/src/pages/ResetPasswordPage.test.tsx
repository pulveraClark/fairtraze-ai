import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "../router";
import { ResetPasswordPage } from "./ResetPasswordPage";

const fetchMock = vi.fn();

function renderPage(search = "?token=abc123") {
  window.history.pushState({}, "", `/reset-password${search}`);
  return render(
    <RouterProvider>
      <ResetPasswordPage />
    </RouterProvider>,
  );
}

async function fill(password: string, confirm = password) {
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

  it("checks length and match in the browser before calling the server", async () => {
    renderPage();
    await fill("short");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("New password"));
    await userEvent.clear(screen.getByLabelText("Confirm new password"));
    await fill("password123", "password124");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("show/hide switches both password fields between hidden and visible", async () => {
    renderPage();
    const pw = screen.getByLabelText("New password") as HTMLInputElement;
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
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "ok" }) });
    renderPage("?token=abc123");
    await fill("password123");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/reset-password");
    expect(JSON.parse(init.body as string)).toEqual({ token: "abc123", newPassword: "password123" });

    expect(await screen.findByText(/Password reset successful/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to sign in" }));
    expect(window.location.pathname).toBe("/login");
  });

  it("on a 400 (expired or used link) shows the plain message and Request a new link", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "This reset link is invalid or has expired." }) });
    renderPage("?token=old");
    await fill("password123");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("This link expired or was already used.")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Request a new link" }));
    expect(window.location.pathname).toBe("/forgot-password");
  });

  it("on another failure keeps the form and shows the error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: "Too many requests" }) });
    renderPage("?token=abc123");
    await fill("password123");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });
});
