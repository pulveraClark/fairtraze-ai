import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JoinPage } from "./JoinPage";

const auth: { user: { systemRole: string } | null; loading: boolean } = { user: null, loading: false };
const navigate = vi.fn();
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: auth.user, token: "t", loading: auth.loading }),
}));
vi.mock("../router", () => ({ useRouter: () => ({ navigate }) }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  window.history.pushState({}, "", "/join?code=AB12");
  localStorage.clear();
  navigate.mockClear();
  auth.user = { systemRole: "STUDENT" };
  auth.loading = false;
});
afterEach(() => vi.unstubAllGlobals());

describe("JoinPage (invite link)", () => {
  it("logged out: keeps the link for after sign-in and goes to login", async () => {
    auth.user = null;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<JoinPage />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login"));
    expect(localStorage.getItem("ft_next")).toBe("/join?code=AB12");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("student not enrolled: asks first, never auto-enrols, and a double click joins once", async () => {
    let resolveJoin: (r: Response) => void = () => undefined;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Promise<Response>((r) => { resolveJoin = r; });
      return Promise.resolve(json({ classId: 5, className: "CC-101 — Intro", alreadyEnrolled: false }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<JoinPage />);

    expect(await screen.findByText(/CC-101 — Intro/)).toBeTruthy();
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(0);

    const join = screen.getByRole("button", { name: "Join" });
    await userEvent.dblClick(join);
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Joining…" })).toBeTruthy();

    resolveJoin(json({ subjectCode: "CC-101", subjectName: "Intro" }, 201));
    expect(await screen.findByText("CC-101 — Intro")).toBeTruthy();
  });

  it("already enrolled: goes straight to the class", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ classId: 5, className: "CC-101 — Intro", alreadyEnrolled: true })));
    render(<JoinPage />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/student/class/5"));
  });

  it("instructor: a message, no lookup, no join", () => {
    auth.user = { systemRole: "INSTRUCTOR" };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<JoinPage />);
    expect(screen.getByText(/nothing was joined/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an unknown code shows the server's message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Invalid join code. Check the code and try again." }, 404)));
    render(<JoinPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid join code");
  });
});
