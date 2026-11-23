import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, useRouter } from "../router";
import { ToastProvider } from "../components/Toast";
import { ProjectCard, StudentClassPage } from "./StudentClassPage";
import { StudentPage } from "./StudentPage";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 1, name: "Ana Cruz", systemRole: "STUDENT", consentVersion: "1.3" }, logout: vi.fn() }),
  useAuthOptional: () => null,
}));
vi.mock("../hooks/useInvalidateOnAlertCount", () => ({ useInvalidateOnAlertCount: () => {} }));
vi.mock("../hooks/useGroupQueries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useGroupQueries")>()),
  useClassProjectsQuery: () => ({
    data: {
      classSection: { id: 5, subjectCode: "CC-APPSDEV22", subjectName: "Applications Development", department: null, edpCode: "1234", joinCode: "ABC123" },
      assignments: [],
    },
    isLoading: false, error: null,
  }),
}));

afterEach(() => { vi.unstubAllGlobals(); });

const ok = (body: unknown = {}) => ({ ok: true, status: 200, json: async () => body });
const fail = (error: string, status = 400) => ({ ok: false, status, json: async () => ({ error }) });

const asgn = (over: Record<string, unknown> = {}) => ({
  id: 9, title: "Capstone", description: null, attachments: [], sourceType: "GITHUB", deadline: null, maxGroupSize: 5,
  myGroup: null, myRequest: null,
  groups: [{ id: 3, groupName: "Group A", leaderName: "Ben Lim", memberCount: 2, maxGroupSize: 5, isFull: false }],
  ...over,
});

function renderCard(a: unknown, onChanged = vi.fn()) {
  render(<ToastProvider><ProjectCard asgn={a as never} token="t" onNavigate={vi.fn()} onManage={vi.fn()} onChanged={onChanged} /></ToastProvider>);
  return onChanged;
}

describe("creating and requesting a group", () => {
  // STU-05
  // INT-009
  it("'Group created.' shows only after the server accepted it, with 'Creating…' while it runs", async () => {
    let release!: () => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => { release = () => r(ok({})); })));
    const onChanged = renderCard(asgn());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Create group$/i }));
    await user.type(screen.getByPlaceholderText(/group name/i), "Team Rocket");
    await user.click(screen.getByRole("button", { name: "Create Group" }));
    expect(screen.getByRole("button", { name: /Creating/ })).toBeDisabled();
    expect(screen.queryByText("Group created.")).not.toBeInTheDocument();
    await act(async () => { release(); });
    expect(await screen.findByText("Group created.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("a refused create shows the server message and no toast; a network failure is no longer silent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail("A group with that name already exists.")));
    renderCard(asgn());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Create group$/i }));
    await user.type(screen.getByPlaceholderText(/group name/i), "Team Rocket");
    await user.click(screen.getByRole("button", { name: "Create Group" }));
    expect(await screen.findByText("A group with that name already exists.")).toBeInTheDocument();
    expect(screen.queryByText("Group created.")).not.toBeInTheDocument();

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await user.click(screen.getByRole("button", { name: "Create Group" }));
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
  });

  // AUTH-38: the server's 403 EMAIL_NOT_VERIFIED text is shown in full, next to the form, and is not swallowed.
  const VERIFY_TEXT = "Please verify your email before doing this. Check your inbox or use Resend email at the top of the page.";
  const refused = () => ({ ok: false, status: 403, json: async () => ({ error: VERIFY_TEXT, code: "EMAIL_NOT_VERIFIED" }) });

  it("AUTH-38 the Create group form shows the verify-your-email message with the next step", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => refused()));
    renderCard(asgn());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Create group$/i }));
    await user.type(screen.getByPlaceholderText(/group name/i), "Team Rocket");
    await user.click(screen.getByRole("button", { name: "Create Group" }));
    expect(await screen.findByText(VERIFY_TEXT)).toBeInTheDocument();
    expect(screen.queryByText("Group created.")).not.toBeInTheDocument();
  });

  it("AUTH-38 the Join (request) form shows the same message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => refused()));
    renderCard(asgn());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Request to join a group/i }));
    await user.click(screen.getByRole("radio", { name: /Group A/i }));
    await user.click(screen.getByRole("button", { name: /Send Request/i }));
    expect(await screen.findByText(VERIFY_TEXT)).toBeInTheDocument();
  });

  it("cancelling a join request says 'Request cancelled.'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({})));
    renderCard(asgn({ myRequest: { id: 4, projectId: 3, groupName: "Group A", status: "PENDING" } }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    expect(await screen.findByText("Request cancelled.")).toBeInTheDocument();
  });
});

describe("leaving a class", () => {
  beforeEach(() => { window.history.pushState({}, "", "/student/class/5"); });

  function Harness() {
    const { pathname } = useRouter();
    return pathname.startsWith("/student/class") ? <StudentClassPage classId={5} /> : <h1>Student home</h1>;
  }
  const renderApp = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider><ToastProvider><Harness /></ToastProvider></RouterProvider>
    </QueryClientProvider>,
  );

  it("goes to the dashboard and the 'You left the class.' toast is still there after the page changed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({})));
    renderApp();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Leave class" }));
    const confirm = (await screen.findAllByRole("button", { name: "Leave class" }))[0]!;
    await user.click(confirm);
    expect(await screen.findByRole("heading", { name: "Student home" })).toBeInTheDocument();
    expect(await screen.findByText("You left the class.")).toBeInTheDocument();
  });

  it("a refused leave stays on the page with the message and no toast", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail("Leave your group first.")));
    renderApp();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Leave class" }));
    await user.click((await screen.findAllByRole("button", { name: "Leave class" }))[0]!);
    expect(await screen.findByText("Leave your group first.")).toBeInTheDocument();
    expect(screen.queryByText("You left the class.")).not.toBeInTheDocument();
  });
});

describe("joining a class by code (dashboard)", () => {
  it("a network failure now shows the calm line instead of nothing, and the panel is the success feedback", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/join/class") throw new TypeError("Failed to fetch");
      return ok({ classes: [] });
    }));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider><ToastProvider><StudentPage /></ToastProvider></RouterProvider>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    const open = await screen.findAllByRole("button", { name: /join a class/i });
    await user.click(open[0]);
    await user.type(screen.getByPlaceholderText(/FT-APPS/i), "ABC123");
    await user.click(screen.getByRole("button", { name: /Enroll/ }));
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Enroll/ })).toBeEnabled());
  });
});
