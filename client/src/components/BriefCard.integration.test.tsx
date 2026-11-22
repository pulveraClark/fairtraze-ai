import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { StudentGroupPage } from "../pages/StudentGroupPage";
import { clearBriefBlobCache } from "../lib/briefAttachments";

// Integration: StudentGroupPage -> its real data hook (useStudentGroupQuery) -> GET /api/student/group/:id (stubbed fetch)
// -> the "Project instructions" panel (BriefModal / BriefCard). Only the API answer is faked; the page, the hook and the
// panel are the real ones. The existing StudentGroupPage test fills the page from a fixture and never loads attachments.

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "tok", user: { id: 1, name: "Ana Cruz", role: "STUDENT" } }),
  useAuthOptional: () => ({ token: "tok", user: { id: 1, name: "Ana Cruz", role: "STUDENT" } }),
}));
// Keep useStudentGroupQuery real; the other queries on the page are not part of this flow.
vi.mock("../hooks/useGroupQueries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useGroupQueries")>()),
  useGroupSetupQuery: () => ({ data: undefined }),
  useGroupTasksQuery: () => ({ data: [] }),
  useMyDisputesQuery: () => ({ data: [], isPending: false }),
}));
vi.mock("../components/Toast", () => ({ useToast: () => ({ showSuccessToast: vi.fn(), showToast: vi.fn(), showError: vi.fn() }) }));
vi.mock("../hooks/useInvalidateOnAlertCount", () => ({ useInvalidateOnAlertCount: () => undefined }));
vi.mock("../components/tasks/TasksTab", () => ({ TasksTab: () => <div>tasks-board</div> }));
vi.mock("../components/DocumentGate", () => ({ DocumentGate: () => <div>docs-editor</div> }));
vi.mock("../components/GroupManageModal", () => ({ GroupManageModal: () => <div>manage-modal</div> }));

const INSTRUCTIONS = "Build a fair grading tool and document every sprint.";
const apiBody = {
  classSection: { id: 5, subjectCode: "IT-ELEC 2", subjectName: "Electives", department: null, edpCode: "UXA634062" },
  assignment: {
    id: 9, title: "Sprint Project", deadline: null, sourceType: "COMBINED", description: INSTRUCTIONS,
    attachments: [
      { id: 31, kind: "IMAGE", mime: "image/webp", filename: "wireframe.webp", size: 10, order: 0 },
      { id: 32, kind: "PDF", mime: "application/pdf", filename: "spec.pdf", size: 10, order: 0 },
    ],
  },
  project: { id: 1, groupName: "Group 1", repoUrl: "" },
  membership: { role: "MEMBER", functionalRoles: ["DEVELOPER"], joinedAt: "2026-10-01T00:00:00Z", roleSuggestion: null },
  hasReport: false,
  report: null,
};

describe("Project instructions panel on the student page", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    cleanup();
    clearBriefBlobCache();
    localStorage.clear();
    window.history.pushState({}, "", "/student/group/1");
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url) === "/api/student/group/1") return { ok: true, status: 200, json: async () => apiBody };
      // Attachment bytes (authenticated): an empty body is enough to build the image/PDF object URL.
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4), json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  // INT-011
  it("renders the instructions text and the attachments that the group API returned", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider><StudentGroupPage projectId={1} /></RouterProvider>
      </QueryClientProvider>,
    );

    // The page asked the API for the group, with the member's token.
    const button = await screen.findByRole("button", { name: "Instructions" });
    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/student/group/1");
    expect(call?.[1]).toMatchObject({ headers: { Authorization: "Bearer tok" } });

    // The text stays out of the page until the panel is opened.
    expect(screen.queryByText(INSTRUCTIONS)).toBeNull();
    fireEvent.click(button);

    const dialog = screen.getByRole("dialog", { name: "Project instructions: Sprint Project" });
    expect(within(dialog).getByText(INSTRUCTIONS)).toBeTruthy();
    // The PDF attachment is listed by file name; the image is loaded through the authenticated attachment URL.
    expect(within(dialog).getByText("spec.pdf")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Open PDF" })).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByAltText("wireframe.webp")).toBeTruthy());
    const attachmentCalls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/api/assignments/9/attachments/"));
    expect(attachmentCalls.some((u) => u.endsWith("/31"))).toBe(true);
  });
});
