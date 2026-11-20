import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { DisputesPage } from "./DisputesPage";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 9, name: "Prof", systemRole: "INSTRUCTOR" } }),
}));
vi.mock("../hooks/useInvalidateOnAlertCount", () => ({ useInvalidateOnAlertCount: () => undefined }));
const classes = vi.hoisted(() => ({
  list: [] as { id: number; subjectCode: string; subjectName: string; edpCode: string }[],
}));
vi.mock("../hooks/useSharedQueries", () => ({ useClassesListQuery: () => ({ data: classes.list }) }));
const showSuccessToast = vi.hoisted(() => vi.fn());
vi.mock("../components/Toast", () => ({ useToast: () => ({ show: vi.fn(), toast: vi.fn(), showSuccessToast }) }));

function renderPage() {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ disputes: [], openCount: 0 }) })));
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider><DisputesPage /></RouterProvider>
    </QueryClientProvider>,
  );
}

describe("DisputesPage", () => {
  it("the class select never grows wider than a 375px screen (I29)", async () => {
    classes.list = [{ id: 1, subjectCode: "UXA-101", subjectName: "A very long subject name that would push the select past a phone screen", edpCode: "12345" }];
    renderPage();
    const select = await screen.findByRole("combobox");
    expect(select).toHaveClass("w-full", "max-w-full", "min-w-0");
    classes.list = [];
  });

  it("has no 'Back to Dashboard' link; sidebar and breadcrumb cover it (R6)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ disputes: [], openCount: 0 }) })));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider><DisputesPage /></RouterProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole("heading", { name: "Disputes" });
    expect(screen.queryByText(/back to dashboard/i)).toBeNull();
  });

  it("opening the response window marks the note as seen, once, with no extra click", async () => {
    const open = {
      id: 5, memberName: "Ana", reason: "Offline work.", status: "OPEN", instructorResponse: null, disputedFlags: [],
      createdAt: "2026-10-18T10:00:00Z", seenAt: null, resolvedAt: null,
      project: { id: 3, groupName: "Group A", name: "App", assignment: null },
    };
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => (String(url).includes("/seen") ? { seenAt: "2026-10-19T10:00:00Z" } : { disputes: [open], openCount: 1 }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider><DisputesPage /></RouterProvider>
      </QueryClientProvider>,
    );
    const seenCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/disputes/5/seen"));
    const button = await screen.findByRole("button", { name: /Respond/ });
    expect(seenCalls()).toHaveLength(0);
    fireEvent.click(button);
    await waitFor(() => expect(seenCalls()).toHaveLength(1));
    expect(fetchMock.mock.calls.find(([u]) => String(u).includes("/seen"))![1]).toMatchObject({ method: "POST" });
  });
});

// ── Live-site cases DSP-03 / 05 / 07 / 08 / 11 ────────────────────────────────
function dispute(over: Record<string, unknown> = {}) {
  return {
    id: 5, memberName: "Ana", reason: "Offline work.", status: "OPEN", instructorResponse: null, disputedFlags: [],
    createdAt: "2026-10-18T10:00:00Z", seenAt: null, resolvedAt: null,
    project: { id: 3, groupName: "Group A", name: "App", assignment: null },
    ...over,
  };
}

function renderWith(handler: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({ ok: true, json: async () => handler(String(url), init) }));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider><DisputesPage /></RouterProvider>
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe("DisputesPage live-site cases", () => {
  it("DSP-03: View group report on a dispute row opens that group's report", async () => {
    renderWith(() => ({ disputes: [dispute()], openCount: 1 }));
    fireEvent.click(await screen.findByRole("button", { name: /View group report/ }));
    await waitFor(() => expect(window.location.pathname).toBe("/project/3"));
  });

  it("DSP-05: submitting a response sends the chosen outcome and the text, then the window closes", async () => {
    showSuccessToast.mockClear();
    const fetchMock = renderWith((url) => (url.includes("/resolve") ? {} : url.includes("/seen") ? {} : { disputes: [dispute()], openCount: 1 }));
    fireEvent.click(await screen.findByRole("button", { name: /Respond/ }));
    const submit = await screen.findByRole("button", { name: "Submit response" });
    expect(submit).toBeDisabled(); // no response typed yet
    fireEvent.click(screen.getByRole("radio", { name: "Dismissed" }));
    fireEvent.change(screen.getByPlaceholderText(/Provide context or a decision/), { target: { value: "  Result stands.  " } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalledWith("Dispute resolved."));
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/disputes/5/resolve"))!;
    expect(call[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(call[1]!.body))).toEqual({ status: "DISMISSED", instructorResponse: "Result stands." });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Respond to dispute" })).toBeNull());
  });

  it("DSP-07: Cancel closes the window and sends nothing to resolve the dispute", async () => {
    const fetchMock = renderWith((url) => (url.includes("/seen") ? {} : { disputes: [dispute()], openCount: 1 }));
    fireEvent.click(await screen.findByRole("button", { name: /Respond/ }));
    fireEvent.change(await screen.findByPlaceholderText(/Provide context or a decision/), { target: { value: "draft text" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Respond to dispute" })).toBeNull();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/resolve"))).toBe(false);
    expect(screen.getByRole("button", { name: /Respond/ })).toBeInTheDocument(); // the dispute is still open
  });

  it("DSP-08: a resolved dispute shows its response and has no Respond & resolve button", async () => {
    renderWith(() => ({
      disputes: [dispute({ status: "RESOLVED", instructorResponse: "We accepted your note.", resolvedAt: "2026-10-19T10:00:00Z" })],
      openCount: 0,
    }));
    expect(await screen.findByText("We accepted your note.")).toBeInTheDocument();
    expect(screen.getByText("RESOLVED")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Respond/ })).toBeNull();
    expect(screen.getByRole("button", { name: /View group report/ })).toBeInTheDocument();
  });

  it("DSP-11: the list pages with Prev and Next and asks the server for the next page", async () => {
    const fetchMock = renderWith((url) => {
      const page = Number(new URL(url, "http://x").searchParams.get("page") ?? 1);
      return { disputes: [dispute({ id: page, memberName: `Member on page ${page}` })], openCount: 1, total: 45, page, pageSize: 20, totalPages: 3 };
    });
    expect(await screen.findByText("Member on page 1")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Prev/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(await screen.findByText("Member on page 2")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("page=2"))).toBe(true);
    expect(screen.getByRole("button", { name: /Prev/ })).toBeEnabled();
  });
});
