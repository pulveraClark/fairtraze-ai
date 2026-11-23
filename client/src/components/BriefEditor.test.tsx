import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BriefEditor } from "./BriefEditor";
import { emptyDraft } from "../lib/briefAttachments";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t" }) }));

describe("BriefEditor", () => {
  it("warns, in one muted line near the attach buttons, not to put personal data or passwords in the files", () => {
    render(<BriefEditor assignmentId={null} description="" onDescriptionChange={() => {}} draft={emptyDraft()} onDraftChange={() => {}} />);
    const hint = screen.getByText("Don't put personal data or passwords in project instructions files.");
    expect(hint.className).toContain("text-xs");
    expect(hint.className).not.toContain("text-slate-400");
    expect(hint.id).toBe("project-files-hint");
    // Both attach buttons are described by it, so a screen reader announces it with them.
    expect(screen.getByRole("button", { name: "Add images" }).getAttribute("aria-describedby")).toBe("project-files-hint");
    expect(screen.getByRole("button", { name: "Add PDF" }).getAttribute("aria-describedby")).toBe("project-files-hint");
  });
});
