import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { GroupManageModal } from "./GroupManageModal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q: { requests: any[]; suggestions: any[] } = { requests: [], suggestions: [] };

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 1, name: "Ana Cruz", systemRole: "STUDENT" } }),
}));
vi.mock("./Toast", () => ({ useToast: () => ({ showSuccessToast: vi.fn() }) }));
vi.mock("../hooks/useGroupQueries", () => ({
  groupKeys: { manage: () => ["m"], all: () => ["a"], requests: () => ["r"], roleSuggestions: () => ["s"] },
  useGroupManageQuery: () => ({
    data: {
      id: 1, groupName: "Group 1", repoUrl: "", sourceType: "COMBINED", maxGroupSize: null,
      members: [
        { userId: 1, name: "Ana Cruz", email: "a@x.t", githubUsername: null, role: "LEADER", functionalRoles: ["DEVELOPER"], joinedAt: "" },
        { userId: 2, name: "Ben Lim", email: "b@x.t", githubUsername: null, role: "MEMBER", functionalRoles: ["DEVELOPER"], joinedAt: "" },
      ],
    },
    isLoading: false, error: null,
  }),
  useGroupRequestsQuery: () => ({ data: q.requests, isLoading: false, error: null }),
  useRoleSuggestionsQuery: () => ({ data: q.suggestions, isLoading: false, error: null }),
}));

function renderModal() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider><GroupManageModal projectId={1} isInstructor={false} onClose={() => {}} onChanged={() => {}} /></RouterProvider>
    </QueryClientProvider>,
  );
}

describe("GroupManageModal leader change wording (I33)", () => {
  beforeEach(() => { q.requests = []; q.suggestions = []; });

  it("calls it 'Change leader' everywhere and has no 'Reassign to leave'", async () => {
    renderModal();
    expect(screen.queryByText(/reassign/i)).toBeNull();
    const buttons = screen.getAllByRole("button", { name: /change leader/i });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]);
    expect(screen.getByRole("heading", { name: "Change leader" })).toBeTruthy();
    await userEvent.click(screen.getByRole("radio"));
    await userEvent.click(screen.getByRole("button", { name: /^continue/i }));
    expect(screen.getByRole("button", { name: "Confirm leader change" })).toBeTruthy();
    expect(screen.queryByText(/reassign/i)).toBeNull();
  });
});

describe("GroupManageModal empty sections (R7)", () => {
  beforeEach(() => { q.requests = []; q.suggestions = []; });

  it("hides pending join requests and role suggestions when there are none", () => {
    renderModal();
    expect(screen.getByText("Ben Lim")).toBeTruthy();
    expect(screen.queryByText("Pending Join Requests")).toBeNull();
    expect(screen.queryByText("Pending Role Suggestions")).toBeNull();
    expect(screen.queryByText(/No pending/)).toBeNull();
  });

  it("shows each section once it has content", () => {
    q.requests = [{ id: 1, student: { id: 5, name: "Cy Tan", email: "c@x.t", githubUsername: null }, status: "PENDING", createdAt: "" }];
    q.suggestions = [{ id: 2, user: { id: 2, name: "Ben Lim", email: "b@x.t" }, suggestedRoles: ["DOCUMENTATION"], status: "PENDING", createdAt: "" }];
    renderModal();
    expect(screen.getByText("Pending Join Requests")).toBeTruthy();
    expect(screen.getByText("Cy Tan")).toBeTruthy();
    expect(screen.getByText("Pending Role Suggestions")).toBeTruthy();
  });
});
