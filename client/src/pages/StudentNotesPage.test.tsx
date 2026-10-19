import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouterProvider } from "../router";
import { StudentNotesPage } from "./StudentNotesPage";
import type { StudentNote } from "../lib/notes";

const state: { data?: StudentNote[]; pending: boolean; error: boolean } = { pending: false, error: false };
vi.mock("../hooks/useGroupQueries", () => ({
  useMyDisputesQuery: () => ({
    data: state.data, isPending: state.pending, isError: state.error, isSuccess: !state.pending && !state.error,
    refetch: vi.fn(),
  }),
}));

const note = (over: Partial<StudentNote>): StudentNote => ({
  id: 1, projectId: 7, status: "OPEN", reason: "Most of my work was offline research.", instructorResponse: null,
  disputedFlags: '["inactive"]', createdAt: "2026-10-18T10:00:00Z", resolvedAt: null, project: { id: 7, groupName: "Group Alpha" }, ...over,
});

function renderPage() {
  return render(<RouterProvider><StudentNotesPage /></RouterProvider>);
}

describe("StudentNotesPage", () => {
  beforeEach(() => { state.pending = false; state.error = false; state.data = []; window.history.pushState({}, "", "/disputes"); });

  it("explains how to add a note when there are none", () => {
    renderPage();
    expect(screen.getByText(/You have not sent a note/)).toBeInTheDocument();
  });

  it("shows an open note with its status in words and no reply yet", () => {
    state.data = [note({})];
    renderPage();
    expect(screen.getByText("Open - awaiting review")).toBeInTheDocument();
    expect(screen.getByText("Most of my work was offline research.")).toBeInTheDocument();
    expect(screen.getByText("Group Alpha")).toBeInTheDocument();
    expect(screen.getByText(/has not replied yet/)).toBeInTheDocument();
    expect(screen.getByText(/About: Inactive/)).toBeInTheDocument();
  });

  it("shows the instructor reply on a reviewed note, newest note first", () => {
    state.data = [
      note({ id: 1, createdAt: "2026-10-01T10:00:00Z" }),
      note({ id: 2, createdAt: "2026-10-05T10:00:00Z", status: "RESOLVED", instructorResponse: "Thanks, noted.", resolvedAt: "2026-10-06T10:00:00Z", disputedFlags: "" }),
    ];
    renderPage();
    expect(screen.getByText("Reviewed - accepted")).toBeInTheDocument();
    expect(screen.getByText("Thanks, noted.")).toBeInTheDocument();
    const articles = screen.getAllByRole("article");
    expect(articles[0]!.id).toBe("note-2");
  });

  it("marks the note named in ?note= and keeps loading and error states in words", () => {
    window.history.pushState({}, "", "/disputes?note=2");
    state.data = [note({ id: 1 }), note({ id: 2 })];
    renderPage();
    expect(document.getElementById("note-2")!.className).toContain("ring-2");
    expect(document.getElementById("note-1")!.className).not.toContain("ring-2");
  });

  it("says so when it cannot load", () => {
    state.error = true; state.data = undefined;
    renderPage();
    expect(screen.getByText(/Could not load your notes/)).toBeInTheDocument();
  });
});
