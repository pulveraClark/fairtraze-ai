import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { PrivacySettingsCard } from "./PrivacySettingsCard";
import { ProfilePhotoControls } from "./ProfilePhotoControls";
import { RouterProvider } from "../router";
import { SettingsPage } from "../pages/SettingsPage";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    token: "t", refreshUser: vi.fn(), logout: vi.fn(),
    user: { id: 1, name: "Ana Cruz", systemRole: "STUDENT", consentVersion: "1.3" },
  }),
  useAuthOptional: () => null,
}));
vi.mock("./Avatar", () => ({ Avatar: () => null, clearAvatarCache: vi.fn() }));

afterEach(() => { vi.unstubAllGlobals(); });

const ok = (body: unknown = {}) => ({ ok: true, status: 200, json: async () => body, blob: async () => new Blob(["{}"]) });
const fail = (error: string, status = 400) => ({ ok: false, status, json: async () => ({ error }) });

describe("data export and deletion request", () => {
  function stubDownload() {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
  }

  it("says 'Your data file is ready.' only after the file came back, with 'Preparing…' while it waits", async () => {
    stubDownload();
    let release!: () => void;
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/privacy/export") return new Promise((r) => { release = () => r(ok()); });
      return Promise.resolve(ok({ request: null })); // the deletion-request lookup
    }));
    render(<ToastProvider><PrivacySettingsCard /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Download my data" }));
    expect(screen.getByRole("button", { name: /Preparing/ })).toBeDisabled();
    expect(screen.queryByText("Your data file is ready.")).not.toBeInTheDocument();
    await act(async () => { release(); });
    expect(await screen.findByText("Your data file is ready.")).toBeInTheDocument();
    expect(screen.queryByText(/downloaded/i)).not.toBeInTheDocument(); // we never claim a download we cannot see
  });

  it("a failed export shows a calm line on the card and no 'ready' toast", async () => {
    stubDownload();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/privacy/export" ? fail("x", 500) : ok({ request: null }))));
    render(<ToastProvider><PrivacySettingsCard /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Download my data" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not prepare your data file. Try again.");
    expect(screen.queryByText("Your data file is ready.")).not.toBeInTheDocument();
  });

  it("sending a deletion request confirms with a toast; withdrawing it does too", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/privacy/deletion-request" && init?.method === "POST") {
        return ok({ request: { id: 1, status: "PENDING", createdAt: "2026-11-01T00:00:00Z", reviewNote: null } });
      }
      if (url === "/api/privacy/deletion-request" && init?.method === "DELETE") return ok();
      return ok({ request: null });
    }));
    render(<ToastProvider><PrivacySettingsCard /></ToastProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Request account deletion" }));
    await user.click(screen.getByRole("button", { name: "Send deletion request" }));
    expect(await screen.findByText("Deletion request sent.")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Withdraw request" }));
    expect(await screen.findByText("Deletion request withdrawn.")).toBeInTheDocument();
  });

  it("a refused deletion request shows the server's message and no success toast", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) =>
      (url === "/api/privacy/deletion-request" && init?.method === "POST" ? fail("You already have a request waiting.") : ok({ request: null }))));
    render(<ToastProvider><PrivacySettingsCard /></ToastProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Request account deletion" }));
    await user.click(screen.getByRole("button", { name: "Send deletion request" }));
    expect(await screen.findByText("You already have a request waiting.")).toBeInTheDocument();
    expect(screen.queryByText("Deletion request sent.")).not.toBeInTheDocument();
  });
});

describe("profile photo", () => {
  it("removing the photo shows 'Removing…' then 'Photo removed.'", async () => {
    let release!: () => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => { release = () => r(ok({ avatarUpdatedAt: null })); })));
    const onChanged = vi.fn();
    render(<ToastProvider><ProfilePhotoControls userId={1} name="Ana Cruz" avatarUpdatedAt="2026-11-01T00:00:00Z" onChanged={onChanged} /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(screen.getByRole("button", { name: /Removing/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Change photo" })).toBeDisabled();
    expect(screen.queryByText("Photo removed.")).not.toBeInTheDocument();
    await act(async () => { release(); });
    expect(await screen.findByText("Photo removed.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledWith(null);
  });

  it("a failed removal keeps the inline line and shows no success toast", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<ToastProvider><ProfilePhotoControls userId={1} name="Ana Cruz" avatarUpdatedAt="2026-11-01T00:00:00Z" onChanged={vi.fn()} /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach the server|Could not reach the server/i);
    expect(screen.queryByText("Photo removed.")).not.toBeInTheDocument();
  });
});

describe("profile and password on the Settings page", () => {
  const profile = {
    id: 1, email: "ana@example.test", name: "Ana Cruz", systemRole: "STUDENT", githubUsername: "anacruz",
    avatarUpdatedAt: null, createdAt: "2026-08-01T00:00:00Z",
  };
  const renderPage = () => render(<RouterProvider><ToastProvider><SettingsPage /></ToastProvider></RouterProvider>);

  it("saving the profile closes the form and says 'Profile saved.' (no banner that disappears by itself)", async () => {
    window.history.pushState({}, "", "/settings");
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) =>
      (init?.method === "PATCH" ? ok({ name: "Ana C. Cruz", githubUsername: "anacruz" }) : ok(profile))));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const name = screen.getByLabelText("Full name");
    await user.clear(name);
    await user.type(name, "Ana C. Cruz");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Edit Profile" })).not.toBeInTheDocument());
    expect(screen.queryByText("Profile updated.")).not.toBeInTheDocument();
  });

  it("a refused profile save keeps the form open with the message and no success toast", async () => {
    window.history.pushState({}, "", "/settings");
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) =>
      (init?.method === "PATCH" ? fail("That GitHub username is already used.") : ok(profile))));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("That GitHub username is already used.")).toBeInTheDocument();
    expect(screen.queryByText("Profile saved.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit Profile" })).toBeInTheDocument();
  });

  it("changing the password says 'Password changed.'", async () => {
    window.history.pushState({}, "", "/settings");
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => (init?.method === "POST" ? ok({}) : ok(profile))));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Change password/ }));
    await user.type(screen.getByLabelText("Current password"), "oldpassword1");
    await user.type(screen.getByLabelText("New password"), "newpassword1");
    await user.type(screen.getByLabelText("Confirm new password"), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByText("Password changed.")).toBeInTheDocument();
  });
});
