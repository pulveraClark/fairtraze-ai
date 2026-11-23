import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { ToastProvider } from "./Toast";
import { GroupManageModal } from "./GroupManageModal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q: { requests: any[]; suggestions: any[]; me: number } = { requests: [], suggestions: [], me: 1 };

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: q.me, name: "Me", systemRole: "STUDENT" } }),
}));
vi.mock("../hooks/useGroupQueries", () => ({
  groupKeys: { manage: () => ["m"], all: () => ["a"], requests: () => ["r"], roleSuggestions: () => ["s"] },
  useGroupManageQuery: () => ({
    data: {
      id: 1, groupName: "Group 1", repoUrl: "", sourceType: "COMBINED", maxGroupSize: null,
      members: [
        { userId: 1, name: "Ana Cruz", githubUsername: "ana", role: "LEADER", functionalRoles: ["DEVELOPER"], joinedAt: "" },
        { userId: 2, name: "Ben Lim", githubUsername: "ben", role: "MEMBER", functionalRoles: ["DEVELOPER"], joinedAt: "" },
      ],
    },
    isLoading: false, error: null,
  }),
  useGroupRequestsQuery: () => ({ data: q.requests, isLoading: false, error: null }),
  useRoleSuggestionsQuery: () => ({ data: q.suggestions, isLoading: false, error: null }),
}));

const req = (id: number, name: string) => ({ id, student: { id: 10 + id, name, email: "", githubUsername: null }, status: "PENDING", createdAt: "" });
const ok = (body: unknown = {}) => new Response(JSON.stringify(body), { status: 200 });
const fail = (error: string, status = 403) => new Response(JSON.stringify({ error }), { status });

function renderModal(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider>
        <ToastProvider>
          <GroupManageModal projectId={1} isInstructor={false} onClose={onClose} onChanged={() => {}} />
        </ToastProvider>
      </RouterProvider>
    </QueryClientProvider>,
  );
  return onClose;
}

beforeEach(() => { q.requests = []; q.suggestions = []; q.me = 1; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("GroupManageModal feedback", () => {
  it("accepting a join request shows 'Request accepted.' only after the server says ok", async () => {
    let release!: () => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { release = () => r(ok()); })));
    q.requests = [req(1, "Cara")];
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    // busy: label changes, both row buttons are disabled, no success text yet
    expect(screen.getByRole("button", { name: /Accepting/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decline" })).toBeDisabled();
    expect(screen.queryByText("Request accepted.")).not.toBeInTheDocument();

    release();
    await waitFor(() => expect(screen.getByText("Request accepted.")).toBeInTheDocument());
  });

  it("a double click sends one request", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    q.requests = [req(1, "Cara")];
    renderModal();
    const accept = screen.getByRole("button", { name: "Accept" });
    await userEvent.dblClick(accept);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a refused request shows the server message inline and no success toast", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail("The group is full.")));
    q.requests = [req(1, "Cara")];
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("The group is full.")).toBeInTheDocument();
    expect(screen.queryByText("Request accepted.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled(); // can try again
  });

  it("a network failure now shows a calm message instead of nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    q.requests = [req(1, "Cara")];
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
    expect(screen.queryByText("Request declined.")).not.toBeInTheDocument();
  });

  it("declining shows 'Request declined.'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    q.requests = [req(1, "Cara")];
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(await screen.findByText("Request declined.")).toBeInTheDocument();
  });

  it("accept and decline a role request show their own confirmations", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    q.suggestions = [{ id: 2, user: { id: 2, name: "Ben Lim", email: "" }, suggestedRoles: ["DOCUMENTATION"], status: "PENDING", createdAt: "" }];
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Role request accepted.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(await screen.findByText("Role request declined.")).toBeInTheDocument();
  });

  it("accept all says how many were accepted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ accepted: 2, skipped: 0 })));
    q.requests = [req(1, "Cara"), req(2, "Dan")];
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Accept all" }));
    await userEvent.click(screen.getByRole("button", { name: "Accept 2" }));
    expect(await screen.findByText("2 requests accepted.")).toBeInTheDocument();
  });

  it("removing a member confirms with 'Member removed.' and shows 'Removing…' while it runs", async () => {
    let release!: () => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { release = () => r(ok()); })));
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Ben Lim" }));
    expect(screen.getByRole("button", { name: /Removing/ })).toBeDisabled();
    expect(screen.queryByText("Member removed.")).not.toBeInTheDocument();
    release();
    expect(await screen.findByText("Member removed.")).toBeInTheDocument();
  });

  it("a failed remove goes back to the list with the error and no success toast", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail("Only the leader can remove members.")));
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Ben Lim" }));
    expect(await screen.findByText("Only the leader can remove members.")).toBeInTheDocument();
    expect(screen.queryByText("Member removed.")).not.toBeInTheDocument();
  });

  it("leaving the group closes the modal and the toast is still there", async () => {
    q.me = 2; // Ben, a plain member
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const onClose = renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Leave" }));
    await userEvent.click(screen.getByRole("button", { name: "Leave group" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("You left the group.")).toBeInTheDocument();
  });

  it("changing the leader confirms with 'Leader changed.'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: /change leader/i }));
    await userEvent.click(screen.getByRole("radio"));
    await userEvent.click(screen.getByRole("button", { name: /^continue/i }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm leader change" }));
    expect(await screen.findByText("Leader changed.")).toBeInTheDocument();
  });
});
