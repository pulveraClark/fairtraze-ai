import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PRIVACY_CHANGE_SUMMARY, PRIVACY_NOTICE_VERSION } from "@shared/privacyNotice";
import { RouterProvider } from "../router";
import { ConsentGatePage } from "./ConsentGatePage";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

const mockUseAuth = vi.mocked(AuthContextModule.useAuth);
const refreshUser = vi.fn();

function renderGate(consentVersion: string | null = null) {
  mockUseAuth.mockReturnValue({
    user: { id: 1, email: "s@example.com", name: "S", systemRole: "STUDENT", consentVersion, consentRequired: true },
    token: "t",
    loading: false,
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser,
  });
  return render(
    <RouterProvider>
      <ConsentGatePage />
    </RouterProvider>,
  );
}

describe("ConsentGatePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("tells a returning user what changed, and a brand-new user nothing extra", () => {
    const first = renderGate("1.1");
    expect(screen.getByText(/What changed/)).toBeInTheDocument();
    expect(screen.getByText(PRIVACY_CHANGE_SUMMARY)).toBeInTheDocument();
    first.unmount();
    renderGate(null);
    expect(screen.queryByText(/What changed/)).toBeNull();
  });

  it("blocks until the box is ticked, then records the current version", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    renderGate();

    const agree = screen.getByRole("button", { name: "I agree" });
    expect(agree).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: /read and agree to the privacy notice/i }));
    expect(agree).toBeEnabled();
    await userEvent.click(agree);

    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/privacy/consent");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ version: PRIVACY_NOTICE_VERSION });
  });

  it("explains that the notice changed for a returning user", () => {
    renderGate("0.9");
    expect(screen.getByRole("heading", { name: /has been updated/i })).toBeInTheDocument();
  });

  it("shows the server error and does not continue when saving fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "Notice updated, reload." }) }));
    renderGate();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "I agree" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Notice updated, reload.");
    expect(refreshUser).not.toHaveBeenCalled();
  });
});
