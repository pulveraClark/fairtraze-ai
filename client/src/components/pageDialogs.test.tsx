import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { PageSetupDialog } from "./PageSetupDialog";
import { HeaderFooterDialog } from "./HeaderFooterDialog";
import { DEFAULT_PAGE_SETUP } from "../lib/pageSetup";

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});

function makeEditor() {
  const host = document.body.appendChild(document.createElement("div"));
  const ed = new Editor({ element: host, extensions: [StarterKit.configure({ undoRedo: {} })], content: "<p>hi</p>" });
  editors.push(ed);
  return ed;
}

describe("PageSetupDialog", () => {
  it("starts from the current setup and applies only what the user chose", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<PageSetupDialog editor={makeEditor()} value={DEFAULT_PAGE_SETUP} onApply={onApply} onClose={onClose} />);
    expect(screen.getByRole("radio", { name: /Short/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Portrait" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Normal/ })).toBeChecked();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /A4/ }));
    await user.click(screen.getByRole("radio", { name: "Landscape" }));
    await user.click(screen.getByRole("radio", { name: /Narrow/ }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ pageSize: "A4", orientation: "LANDSCAPE", marginPreset: "NARROW" });
    expect(onClose).toHaveBeenCalled();
  });

  it("offers the three margin presets from the spec", () => {
    render(<PageSetupDialog editor={makeEditor()} value={DEFAULT_PAGE_SETUP} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /Normal \(1 in\)/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Narrow \(0\.5 in\)/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Wide \(1 in top and bottom, 2 in sides\)/ })).toBeInTheDocument();
  });

  it("traps Tab inside, and Esc closes and returns focus to the editor", async () => {
    const ed = makeEditor();
    const onClose = vi.fn();
    const { unmount } = render(<PageSetupDialog editor={ed} value={DEFAULT_PAGE_SETUP} onApply={vi.fn()} onClose={onClose} />);
    const user = userEvent.setup();
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 12; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 12; i++) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount(); // the parent removes the dialog on close
    await waitFor(() => expect(ed.view.dom).toHaveFocus());
  });
});

describe("HeaderFooterDialog", () => {
  const empty = { left: "", center: "", right: "" };

  it("applies the six text boxes and shows the page-number hint", async () => {
    const onApply = vi.fn();
    render(<HeaderFooterDialog editor={makeEditor()} header={empty} footer={empty} onApply={onApply} onClose={vi.fn()} />);
    const user = userEvent.setup();
    const centers = screen.getAllByLabelText("Center");
    expect(centers).toHaveLength(2);
    await user.type(document.getElementById("ft-hf-header-left") as HTMLElement, "Group 4");
    await user.click(centers[1]!);
    await user.paste("Page {page}"); // paste: type() would read {page} as a key name
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({
      header: { left: "Group 4", center: "", right: "" },
      footer: { left: "", center: "Page {page}", right: "" },
    });
    expect(screen.getByText("{page}")).toBeInTheDocument();
  });

  it("limits each box to 120 characters", () => {
    render(<HeaderFooterDialog editor={makeEditor()} header={empty} footer={empty} onApply={vi.fn()} onClose={vi.fn()} />);
    const boxes = within(screen.getByRole("dialog")).getAllByRole("textbox");
    expect(boxes).toHaveLength(6);
    for (const el of boxes) expect(el).toHaveAttribute("maxlength", "120");
  });

  it("traps Tab and closes on Esc", async () => {
    const onClose = vi.fn();
    render(<HeaderFooterDialog editor={makeEditor()} header={empty} footer={empty} onApply={vi.fn()} onClose={onClose} />);
    const user = userEvent.setup();
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 14; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
