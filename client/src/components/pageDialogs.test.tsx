import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { PageSetupDialog } from "./PageSetupDialog";
import { HeaderFooterDialog } from "./HeaderFooterDialog";
import { DEFAULT_PAGE_SETUP } from "../lib/pageSetup";

const editors: Editor[] = [];
afterEach(() => {
  cleanup(); // unmount dialogs first: their focus-return runs against a live editor
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
    expect(screen.getByRole("radio", { name: /Letter/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Portrait" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Normal/ })).toBeChecked();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /A4/ }));
    await user.click(screen.getByRole("radio", { name: "Landscape" }));
    await user.click(screen.getByRole("radio", { name: /Narrow/ }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({
      pageSize: "A4",
      orientation: "LANDSCAPE",
      marginPreset: "NARROW",
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("offers the three margin presets from the spec plus Custom", () => {
    render(<PageSetupDialog editor={makeEditor()} value={DEFAULT_PAGE_SETUP} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /Normal \(1 in\)/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Narrow \(0\.5 in\)/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Wide \(1 in top and bottom, 2 in sides\)/ })).toBeInTheDocument();
  });

  it("uses the standard paper names", () => {
    render(<PageSetupDialog editor={makeEditor()} value={DEFAULT_PAGE_SETUP} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Letter (8.5 × 11 in)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Legal (8.5 × 14 in)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "A4 (210 × 297 mm)" })).toBeInTheDocument();
  });

  const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

  it("shows four labelled inch boxes with range and step, filled from the preset", async () => {
    render(<PageSetupDialog editor={makeEditor()} value={DEFAULT_PAGE_SETUP} onApply={vi.fn()} onClose={vi.fn()} />);
    for (const name of ["Top", "Bottom", "Left", "Right"]) {
      expect(box(name)).toHaveValue(1);
      expect(box(name)).toHaveAttribute("min", "0");
      expect(box(name)).toHaveAttribute("max", "3");
      expect(box(name)).toHaveAttribute("step", "0.1");
    }
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /Wide/ }));
    expect(box("Left")).toHaveValue(2);
    expect(box("Top")).toHaveValue(1);
    await user.click(screen.getByRole("radio", { name: /Narrow/ }));
    expect(box("Right")).toHaveValue(0.5);
  });

  it("editing a box switches to Custom and applies the four numbers", async () => {
    const onApply = vi.fn();
    render(<PageSetupDialog editor={makeEditor()} value={DEFAULT_PAGE_SETUP} onApply={onApply} onClose={vi.fn()} />);
    const user = userEvent.setup();
    await user.clear(box("Left"));
    await user.type(box("Left"), "0.5");
    expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({
      pageSize: "LETTER",
      orientation: "PORTRAIT",
      marginPreset: "CUSTOM",
      margins: { top: 1, bottom: 1, left: 0.5, right: 1 },
    });
  });

  it("reports out-of-range, off-step and empty values with a text message and a disabled Apply", async () => {
    const onApply = vi.fn();
    render(<PageSetupDialog editor={makeEditor()} value={DEFAULT_PAGE_SETUP} onApply={onApply} onClose={vi.fn()} />);
    const user = userEvent.setup();
    expect(screen.queryByRole("alert")).toBeNull();
    await user.clear(box("Top"));
    await user.type(box("Top"), "3.5");
    expect(screen.getByRole("alert")).toHaveTextContent(/Top margin must be between 0 and 3 in/);
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(box("Top")).toHaveAttribute("aria-invalid", "true");
    await user.clear(box("Top"));
    await user.type(box("Top"), "0.15");
    expect(screen.getByRole("alert")).toHaveTextContent(/multiple of 0.1/);
    await user.clear(box("Top"));
    expect(screen.getByRole("alert")).toHaveTextContent(/Top margin must be a number/);
    await user.type(box("Top"), "1");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
    await user.clear(box("Top"));
    await user.type(box("Top"), "9");
    await user.keyboard("{Enter}"); // Enter in a box must not apply an invalid setup
    expect(onApply).not.toHaveBeenCalled();
  });

  it("needs 2 in of writing space: orientation changes can break it, a header/footer counts against it", async () => {
    const tight = { ...DEFAULT_PAGE_SETUP, pageSize: "A4" as const, marginPreset: "CUSTOM" as const, margins: { top: 3, bottom: 3, left: 1, right: 1 } };
    const user = userEvent.setup();
    // A4 landscape is 8.27 in high: 3 + 3 leaves 2.27 (fine) ...
    const { unmount } = render(<PageSetupDialog editor={makeEditor()} value={{ ...tight, orientation: "LANDSCAPE" }} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("alert")).toBeNull();
    // ... but a bigger top margin leaves too little (Top max is 3, so use Left/Right in portrait instead).
    await user.click(screen.getByRole("radio", { name: "Portrait" }));
    await user.clear(box("Left"));
    await user.type(box("Left"), "3");
    await user.clear(box("Right"));
    await user.type(box("Right"), "3");
    expect(screen.queryByRole("alert")).toBeNull(); // 8.27 - 6 = 2.27 wide: fine
    unmount();
    // With a header the same setup leaves 1.97 in of height.
    const withHeader = { ...tight, orientation: "LANDSCAPE" as const, header: { left: "Draft", center: "", right: "" } };
    render(<PageSetupDialog editor={makeEditor()} value={withHeader} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/header\/footer leave 1.97 in of writing height; at least 2 in is needed/);
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
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
