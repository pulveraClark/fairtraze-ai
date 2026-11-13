import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { CommentPanel, type CommentRecord } from "./CommentPanel";

const root: CommentRecord = {
  id: 1, documentId: 1, author: { id: 7, name: "Ana" }, text: "Fix this", anchor: "a", parentId: null, resolvedAt: null, createdAt: new Date().toISOString(),
};

function setup(over: Partial<React.ComponentProps<typeof CommentPanel>> = {}, comment: CommentRecord = root) {
  const props = {
    comments: [comment], currentUserId: 7, memberIds: [7], canModerate: false, pendingSelection: null,
    onCancelPending: vi.fn(), onSubmitNew: vi.fn().mockResolvedValue(undefined), onReply: vi.fn().mockResolvedValue(undefined),
    onResolveToggle: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn().mockResolvedValue(undefined),
    onSelectThread: vi.fn(), activeThreadId: null, ...over,
  };
  render(<CommentPanel {...props} />);
  return props;
}

describe("CommentPanel actions", () => {
  it("actions are real buttons with a pointer cursor, a focus style and a 32px target", () => {
    setup();
    for (const name of ["Reply", "Resolve", "Delete comment"]) {
      const b = screen.getByRole("button", { name });
      expect(b.tagName).toBe("BUTTON");
      expect(b.className).toContain("cursor-pointer");
      expect(b.className).toContain("min-h-8");
      expect(b.className).toContain("focus-visible:outline");
    }
  });

  it("Resolve shows Resolving… and ignores a second click while the request runs", async () => {
    let finish!: () => void;
    const onResolveToggle = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    setup({ onResolveToggle });
    const btn = screen.getByRole("button", { name: "Resolve" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(await screen.findByRole("button", { name: "Resolving…" })).toBeDisabled();
    expect(onResolveToggle).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Resolve" })).not.toBeDisabled());
  });

  it("Reopen shows Reopening… and is the way back for a resolved thread", async () => {
    let finish!: () => void;
    const onResolveToggle = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    setup({ onResolveToggle }, { ...root, resolvedAt: new Date().toISOString() });
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    expect(await screen.findByRole("button", { name: "Reopening…" })).toBeDisabled();
    expect(onResolveToggle).toHaveBeenCalledWith(1, false);
    await act(async () => { finish(); });
  });

  it("the button comes back when the request fails", async () => {
    const onResolveToggle = vi.fn().mockRejectedValue(new Error("x"));
    setup({ onResolveToggle });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Resolve" })).not.toBeDisabled());
  });

  it("the delete button is disabled while deleting", async () => {
    let finish!: () => void;
    const onDelete = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    setup({ onDelete });
    fireEvent.click(screen.getByRole("button", { name: "Delete comment" }));
    expect(await screen.findByRole("button", { name: "Deleting comment" })).toBeDisabled();
    await act(async () => { finish(); });
  });

  it("Cancel is disabled while a new comment is posting", async () => {
    let finish!: () => void;
    const onSubmitNew = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    setup({ pendingSelection: { from: 1, to: 2 }, onSubmitNew });
    fireEvent.change(screen.getByPlaceholderText("Add a comment…"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    expect(await screen.findByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => { finish(); });
  });
});
