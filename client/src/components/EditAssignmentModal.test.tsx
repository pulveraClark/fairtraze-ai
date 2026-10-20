import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditAssignmentModal } from "./EditAssignmentModal";

describe("EditAssignmentModal dialog semantics", () => {
  it("is a modal dialog with the shared 40px close button, and Esc closes it", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // stays on "Loading…"
    const onClose = vi.fn();
    render(<EditAssignmentModal assignmentId={1} token="t" onClose={onClose} onSaved={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Edit project" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("h-10");
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
