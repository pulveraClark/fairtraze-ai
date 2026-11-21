import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "../router";
import { ForgotPasswordPage } from "./ForgotPasswordPage";

const fetchMock = vi.fn();

function renderPage() {
  return render(
    <RouterProvider>
      <ForgotPasswordPage />
    </RouterProvider>,
  );
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "x" }) });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/forgot-password");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps the send button disabled until an email is typed", async () => {
    renderPage();
    const send = screen.getByRole("button", { name: "Send reset link" });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Email address"), "jane@uclm.edu.ph");
    expect(send).toBeEnabled();
  });

  it("posts only the email, then shows the one generic message with the spam hint", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText("Email address"), "jane@uclm.edu.ph");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/forgot-password");
    expect(JSON.parse(init.body as string)).toEqual({ email: "jane@uclm.edu.ph" });

    expect(await screen.findByText(/If an account exists for that email/)).toBeInTheDocument();
    expect(screen.getByText(/Check your spam folder too/)).toBeInTheDocument();
  });

  it("shows the same message when the server answers an error or the network fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    renderPage();
    await userEvent.type(screen.getByLabelText("Email address"), "nobody@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText(/If an account exists for that email/)).toBeInTheDocument();
  });

  it("offers 'Back to sign in' before and after sending", async () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Back to sign in" })).toBeInTheDocument();
    expect(screen.queryByText(/Back to login/)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Email address"), "jane@uclm.edu.ph");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await userEvent.click(await screen.findByRole("button", { name: "Back to sign in" }));
    expect(window.location.pathname).toBe("/login");
  });
});
