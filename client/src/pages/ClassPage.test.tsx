import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { ClassPage } from "./ClassPage";
import { ToastProvider } from "../components/Toast";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 1, name: "Prof", email: "p@x.test", systemRole: "INSTRUCTOR" } }),
  useAuthOptional: () => ({ token: "t" }),
}));

const CLASS = { id: 7, subjectCode: "CC-APPSDEV22", subjectName: "Applications Development", department: { id: 1, name: "CS", code: "CS" }, edpCode: "31400", type: "LECTURE", joinCode: "CLASS-JOIN-1", createdAt: "2026-08-01T00:00:00Z" };
const PROJECTS = [
  { id: 21, title: "Final Group Project", deadline: "2026-12-01T00:00:00Z", maxGroupSize: 5, sourceType: "GITHUB", createdAt: "2026-08-02T00:00:00Z", _count: { projects: 2 } },
  { id: 22, title: "Documentation Sprint", deadline: null, maxGroupSize: 4, sourceType: "EDITOR", createdAt: "2026-08-03T00:00:00Z", _count: { projects: 1 } },
];

type Handler = (url: string, init?: RequestInit) => unknown;
function renderClass(assignments: unknown[], extra?: Handler) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const custom = extra?.(u, init);
    if (custom !== undefined) return { ok: true, json: async () => custom };
    if (u.includes("/api/classes/7/assignments")) return { ok: true, json: async () => ({ class: CLASS, assignments }) };
    if (u.includes("/api/assignments/") && !init?.method) return { ok: true, json: async () => ({ groups: [] }) };
    if (u.includes("/api/projects/summary")) return { ok: true, json: async () => ({ summary: [] }) };
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("scrollTo", vi.fn());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider><ToastProvider><ClassPage classId={7} /></ToastProvider></RouterProvider>
    </QueryClientProvider>,
  );
  return fetchMock;
}

const posted = (fetchMock: ReturnType<typeof renderClass>, suffix: string) =>
  fetchMock.mock.calls.find(([u, i]) => String(u).endsWith(suffix) && (i as RequestInit | undefined)?.method === "POST");

afterEach(() => vi.unstubAllGlobals());

describe("ClassPage", () => {
  it("INS-03: opening a class shows its name and one card per project with its group count", async () => {
    renderClass(PROJECTS);
    expect(await screen.findByRole("heading", { name: "Applications Development" })).toBeInTheDocument();
    expect(screen.getByText("Final Group Project")).toBeInTheDocument();
    expect(screen.getByText("Documentation Sprint")).toBeInTheDocument();
    expect(screen.getByText("2 groups")).toBeInTheDocument();
    expect(screen.getByText("1 group")).toBeInTheDocument();
    expect(screen.getByText(/2 projects/)).toBeInTheDocument();
  });

  it("INS-03: a project card opens that project's page", async () => {
    renderClass(PROJECTS);
    const card = (await screen.findByText("Final Group Project")).closest("[role='button']") as HTMLElement;
    fireEvent.click(card);
    await waitFor(() => expect(window.location.pathname).toBe("/class/7/assignment/21"));
  });

  it("INS-03: a class with no projects says so and offers to create the first one", async () => {
    renderClass([]);
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create first project/ })).toBeInTheDocument();
  });

  // INT-008
  it("INS-04: creating a project sends title, deadline, size and source, and shows no group join code afterwards", async () => {
    const fetchMock = renderClass([], (u, init) =>
      u.endsWith("/api/assignments") && init?.method === "POST" ? { id: 99, joinCode: "GRP-SECRET-1" } : undefined);
    fireEvent.click(await screen.findByRole("button", { name: /New Project/ }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Final Group Project"), { target: { value: "  Capstone  " } });
    fireEvent.change(document.querySelector<HTMLInputElement>("input[type=date]")!, { target: { value: "2026-12-15" } });
    fireEvent.change(document.querySelector<HTMLInputElement>("input[type=number]")!, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("radio", { name: "Combined (GitHub + Docs)" }));
    fireEvent.change(document.getElementById("brief-description")!, { target: { value: "Build the app and document it." } });
    fireEvent.click(screen.getByRole("button", { name: /^Create Project$/ }));
    expect(await screen.findByText(/Capstone.*was created successfully/)).toBeInTheDocument();
    const body = JSON.parse(String((posted(fetchMock, "/api/assignments")![1] as RequestInit).body));
    expect(body).toMatchObject({ classSectionId: 7, title: "Capstone", maxGroupSize: 4, sourceType: "COMBINED" });
    // The success screen points students to the class code; it never prints a group join code.
    expect(screen.queryByText("GRP-SECRET-1")).toBeNull();
    expect(screen.getByText(/class join code/i)).toBeInTheDocument();
  });

  it("INS-04: a project with no analysis source is refused with a message and nothing is sent", async () => {
    const fetchMock = renderClass([]);
    fireEvent.click(await screen.findByRole("button", { name: /New Project/ }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Final Group Project"), { target: { value: "Capstone" } });
    const create = screen.getByRole("button", { name: /^Create Project$/ });
    expect(create).toBeDisabled(); // no deadline yet
    fireEvent.change(document.querySelector<HTMLInputElement>("input[type=date]")!, { target: { value: "2026-12-15" } });
    fireEvent.click(create);
    expect(await screen.findByText("Please choose an analysis source")).toBeInTheDocument();
    expect(posted(fetchMock, "/api/assignments")).toBeUndefined();
  });

  it("INS-08: the project instructions are required; typed text clears the message and is sent as the description", async () => {
    const fetchMock = renderClass([], (u, init) => (u.endsWith("/api/assignments") && init?.method === "POST" ? { id: 5 } : undefined));
    fireEvent.click(await screen.findByRole("button", { name: /New Project/ }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Final Group Project"), { target: { value: "P" } });
    fireEvent.change(document.querySelector<HTMLInputElement>("input[type=date]")!, { target: { value: "2026-12-15" } });
    fireEvent.click(screen.getByRole("radio", { name: "GitHub" }));
    fireEvent.click(screen.getByRole("button", { name: /^Create Project$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Write the project instructions.");
    expect(posted(fetchMock, "/api/assignments")).toBeUndefined();
    fireEvent.change(document.getElementById("brief-description")!, { target: { value: "Read the brief, then build it." } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Create Project$/ }));
    await screen.findByText(/was created successfully/);
    expect(JSON.parse(String((posted(fetchMock, "/api/assignments")![1] as RequestInit).body)).description).toBe("Read the brief, then build it.");
  });
});
