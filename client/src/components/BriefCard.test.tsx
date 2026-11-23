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
    fireEvent.click(screen.getByRole("button", { name: /project instructions/i }));
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

  describe("highlight (from 'See in the instructions')", () => {
    const TEXT = ["# Goals", "- The app must have a login page.", "- Members can’t see each other’s scores."].join("\n");

    it("marks the sentence in the original text, whatever the markers and quotes, and scrolls it into view", () => {
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      const { container } = render(<BriefCard assignmentId={5} description={TEXT} attachments={[]} highlight="Members can't see each other's scores" />);
      const mark = container.querySelector("mark")!;
      expect(mark.textContent).toBe("Members can’t see each other’s scores");
      expect(scroll).toHaveBeenCalled();
      expect(container.textContent).toContain("The app must have a login page.");
    });

    it("shows the text unchanged when the sentence is not in it", () => {
      const { container } = render(<BriefCard assignmentId={6} description={TEXT} attachments={[]} highlight="A sentence that is not there at all." />);
      expect(container.querySelector("mark")).toBeNull();
      expect(container.textContent).toContain("The app must have a login page.");
    });

    it("opens a card that was collapsed on the next visit", () => {
      localStorage.setItem("ft.brief.seen.7", "1");
      const { container } = render(<BriefCard assignmentId={7} description={TEXT} attachments={[]} rememberOpenState highlight="The app must have a login page." />);
      expect(container.querySelector("mark")?.textContent).toBe("The app must have a login page");
    });
  });
});
