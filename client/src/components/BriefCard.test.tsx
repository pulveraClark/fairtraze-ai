import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { BriefCard } from "./BriefCard";
import { clearBriefBlobCache, type BriefAttachment } from "../lib/briefAttachments";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));

const img = (id: number): BriefAttachment => ({ id, kind: "IMAGE", mime: "image/webp", filename: `pic${id}.webp`, size: 10, order: id });
const pdf: BriefAttachment = { id: 9, kind: "PDF", mime: "application/pdf", filename: "spec.pdf", size: 10, order: 0 };

describe("BriefCard", () => {
  beforeEach(() => {
    cleanup();
    clearBriefBlobCache();
    localStorage.clear();
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
  });

  it("is open the first time and collapsed on the next visit", () => {
    const first = render(<BriefCard assignmentId={1} description="Hello" attachments={[]} rememberOpenState />);
    expect(screen.getByText("Hello")).toBeTruthy();
    first.unmount();
    render(<BriefCard assignmentId={1} description="Hello" attachments={[]} rememberOpenState />);
    expect(screen.queryByText("Hello")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /project brief/i }));
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("viewer: opens on click, arrow keys switch images, Esc closes", async () => {
    render(<BriefCard assignmentId={2} description={null} attachments={[img(1), img(2), img(3)]} />);
    fireEvent.click(screen.getByRole("button", { name: /enlarge image 1 of 3/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Image 1 of 3");
    fireEvent.keyDown(document, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Image 2 of 3"));
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Image 3 of 3"));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("builds the PDF blob with a fixed application/pdf type, ignoring response headers", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => { created.push(b as Blob); return "blob:pdf"; });
    render(<BriefCard assignmentId={3} description={null} attachments={[pdf]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open PDF" }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(created[0].type).toBe("application/pdf");
  });

  it("shows an edit button only when onEdit is given", () => {
    const { rerender } = render(<BriefCard assignmentId={4} description="x" attachments={[]} />);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    rerender(<BriefCard assignmentId={4} description="x" attachments={[]} onEdit={() => {}} />);
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });
});
