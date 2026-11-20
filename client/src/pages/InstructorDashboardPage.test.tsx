import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { InstructorDashboardPage } from "./InstructorDashboardPage";
import { ToastProvider } from "../components/Toast";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

beforeEach(() => {
  vi.mocked(AuthContextModule.useAuth).mockReturnValue({
    user: { id: 1, email: "a@example.com", name: "Alex Doe", systemRole: "INSTRUCTOR" },
    token: "t",
    loading: false,
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  } as never);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ classes: [], summary: [] }) })));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("InstructorDashboardPage", () => {
  it("no longer renders the Verify report box (it lives in the sidebar)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider><ToastProvider><InstructorDashboardPage /></ToastProvider></RouterProvider>
      </QueryClientProvider>
    );
    await screen.findByRole("main");
    expect(screen.queryByLabelText("Report ID on the student's printout")).toBeNull();
    expect(screen.queryByText("Verify report")).toBeNull();
  });
});

// ── Live-site cases INS-01 / INS-02 ───────────────────────────────────────────
const CLASS_A = { id: 11, subjectCode: "CC-APPSDEV22", subjectName: "Applications Development", department: { id: 1, name: "Computer Studies", code: "CS" }, edpCode: "31400", type: "LECTURE", joinCode: "JOIN-A1", instructorId: 1, createdAt: "2026-08-01T00:00:00Z", assignments: [{ id: 5, title: "Final Project", deadline: null, maxGroupSize: 5, sourceType: "GITHUB", joinCode: "X", createdAt: "2026-08-02T00:00:00Z", _count: { projects: 2 } }] };
const CLASS_B = { ...CLASS_A, id: 12, subjectCode: "IT-ELEC2", subjectName: "Web Systems", edpCode: "31500", type: "LABORATORY", joinCode: "JOIN-B2", assignments: [] };

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider><ToastProvider><InstructorDashboardPage /></ToastProvider></RouterProvider>
    </QueryClientProvider>,
  );
}

function fillClassForm(schoolYear: string) {
  fireEvent.change(screen.getByPlaceholderText("e.g. CC-APPSDEV22"), { target: { value: "  CC-NEW1  " } });
  fireEvent.change(screen.getByPlaceholderText("e.g. 31400"), { target: { value: "99001" } });
  fireEvent.change(screen.getByPlaceholderText("e.g. Applications Development"), { target: { value: "New Subject" } });
  fireEvent.change(screen.getByLabelText("School year"), { target: { value: schoolYear } });
}

describe("InstructorDashboardPage live-site cases", () => {
  it("INS-01: shows one class card per class, with its subject and EDP code", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("/api/classes") ? { classes: [CLASS_A, CLASS_B] } : { summary: [] }),
    })));
    renderDashboard();
    expect(await screen.findByText("Applications Development")).toBeInTheDocument();
    expect(screen.getByText("Web Systems")).toBeInTheDocument();
    expect(screen.getByText(/31400/)).toBeInTheDocument();
    expect(screen.getByText(/31500/)).toBeInTheDocument();
    expect(screen.queryByText("No classes yet")).toBeNull();
  });

  it("INS-01: with no classes it says so and offers to create the first one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ classes: [], summary: [] }) })));
    renderDashboard();
    expect(await screen.findByText("No classes yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create first class section/ })).toBeInTheDocument();
  });

  it("INS-02: creating a class sends subject, EDP code, term and type, then shows the class join code", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/departments")) return { ok: true, json: async () => ({ departments: [{ id: 1, name: "Computer Studies", code: "CS" }] }) };
      if (u.endsWith("/api/classes") && init?.method === "POST") return { ok: true, json: async () => ({ joinCode: "NEW-CODE-9" }) };
      return { ok: true, json: async () => (u.includes("/api/classes") ? { classes: [] } : { summary: [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDashboard();
    fireEvent.click(await screen.findByRole("button", { name: /New Class Section/ }));
    fillClassForm("2026-2027");
    fireEvent.change(screen.getByLabelText("Semester"), { target: { value: "SECOND" } });
    fireEvent.change(screen.getByDisplayValue("Lecture"), { target: { value: "LABORATORY" } });
    const create = screen.getByRole("button", { name: /Create Class Section/ });
    await waitFor(() => expect(create).toBeEnabled()); // the only department is picked automatically
    fireEvent.click(create);
    expect(await screen.findByText("NEW-CODE-9")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith("/api/classes") && (i as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      subjectCode: "CC-NEW1", subjectName: "New Subject", departmentId: 1, edpCode: "99001",
      type: "LABORATORY", schoolYear: "2026-2027", semester: "SECOND",
    });
  });

  it("INS-02: a malformed school year is refused before anything is sent", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => (String(url).includes("/api/departments") ? { departments: [{ id: 1, name: "CS", code: "CS" }] } : String(url).includes("/api/classes") ? { classes: [] } : { summary: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderDashboard();
    fireEvent.click(await screen.findByRole("button", { name: /New Class Section/ }));
    fillClassForm("2026");
    const create = screen.getByRole("button", { name: /Create Class Section/ });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);
    expect(await screen.findByText("Write the school year like 2026-2027.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "POST")).toBe(false);
  });
});
