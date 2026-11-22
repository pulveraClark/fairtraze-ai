import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PrivacySettingsCard } from "./PrivacySettingsCard";
import { ToastProvider } from "./Toast";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 1, name: "Ana", systemRole: "STUDENT", consentVersion: "1.4" } }),
}));

type Existing = null | { id: number; status: string; createdAt: string; reviewNote: string | null };

function renderCard(existing: Existing = null) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (String(url).includes("/api/privacy/deletion-request") && method === "GET") return { ok: true, json: async () => ({ request: existing }) };
    if (String(url).includes("/api/privacy/deletion-request") && method === "POST") {
      return { ok: true, json: async () => ({ request: { id: 3, status: "PENDING", createdAt: "2026-11-01T00:00:00Z" } }) };
    }
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ToastProvider><PrivacySettingsCard /></ToastProvider>);
  return fetchMock;
}

const writes = (m: ReturnType<typeof renderCard>) =>
  m.mock.calls.filter(([, i]) => ["POST", "DELETE"].includes((i as RequestInit | undefined)?.method ?? "GET"));

afterEach(() => vi.unstubAllGlobals());

describe("PrivacySettingsCard: account deletion request", () => {
  it("STU-18: the area says an administrator reviews the request and that contributions stay as Former member", async () => {
    renderCard();
    const heading = await screen.findByRole("heading", { name: "Delete my account" });
    const area = heading.parentElement as HTMLElement;
    expect(area).toHaveTextContent("An administrator reviews your request");
    expect(area).toHaveTextContent("Former member");
    expect(screen.getByRole("button", { name: "Request account deletion" })).toBeInTheDocument();
  });

  it("STU-18: the button opens a dialog that lists what happens, and nothing is sent yet", async () => {
    const fetchMock = renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Request account deletion" }));
    const dialog = screen.getByRole("dialog", { name: "Request account deletion?" });
    expect(within(dialog).getByText(/An administrator must approve the request/)).toBeInTheDocument();
    expect(within(dialog).getByText(/you are signed out everywhere/)).toBeInTheDocument();
    expect(within(dialog).getByText("anonymized, not deleted")).toBeInTheDocument();
    expect(within(dialog).getByText(/teammates' reports and scores do not change/)).toBeInTheDocument();
    expect(writes(fetchMock)).toHaveLength(0);
  });

  it("STU-18: Keep my account closes the dialog without sending a request", async () => {
    const fetchMock = renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Request account deletion" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep my account" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(writes(fetchMock)).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Request account deletion" })).toBeInTheDocument();
  });

  // INT-032
  it("STU-18: sending the request (mocked server) posts the reason and then shows Pending review with a way to withdraw", async () => {
    const fetchMock = renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Request account deletion" }));
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "  Leaving the course.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send deletion request" }));
    expect(await screen.findByText("Pending review")).toBeInTheDocument();
    const post = writes(fetchMock)[0];
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({ reason: "Leaving the course." });
    expect(screen.getByRole("button", { name: "Withdraw request" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request account deletion" })).toBeNull();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("STU-18: a request already waiting shows Pending review at once", async () => {
    renderCard({ id: 1, status: "PENDING", createdAt: "2026-11-01T00:00:00Z", reviewNote: null });
    expect(await screen.findByText("Pending review")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request account deletion" })).toBeNull();
  });

  // INT-037
  it("a rejected request is shown back with the admin's note, and the student can ask again", async () => {
    renderCard({ id: 1, status: "REJECTED", createdAt: "2026-11-01T00:00:00Z", reviewNote: "Hand over your group first." });
    expect(await screen.findByText(/Your last request was not approved: Hand over your group first\. You can submit a new one\./)).toBeInTheDocument();
    expect(screen.queryByText("Pending review")).toBeNull();
    expect(screen.getByRole("button", { name: "Request account deletion" })).toBeEnabled();
  });

  // INT-037
  it("a rejected request without a note reads 'not approved.' and the account can still be used", async () => {
    renderCard({ id: 2, status: "REJECTED", createdAt: "2026-11-01T00:00:00Z", reviewNote: null });
    expect(await screen.findByText(/Your last request was not approved\. You can submit a new one\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request account deletion" })).toBeEnabled();
  });
});
