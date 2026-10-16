import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import CharacterCount from "@tiptap/extension-character-count";
import { formattingExtensions, starterKitOptions } from "../lib/formattingExtensions";
import { SearchReplace } from "../lib/searchReplace";
import { PageBreak } from "../lib/pageBreak";
import { Toolbar, overflowFor } from "./DocumentEditorToolbar";

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
  vi.restoreAllMocks();
});

function makeEditor() {
  const ed = new Editor({
    element: document.createElement("div"),
    extensions: [
      // The live editor gets undo/redo from the collaboration extension; here StarterKit supplies it.
      StarterKit.configure({ ...starterKitOptions, undoRedo: {} }),
      ...formattingExtensions,
      SearchReplace,
      PageBreak,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Superscript,
      Subscript,
      CharacterCount,
    ],
    content: "<p>hello</p>",
  });
  editors.push(ed);
  return ed;
}

function renderToolbar(editor: Editor, { editable = true, width }: { editable?: boolean; width: number }) {
  // jsdom has no layout: report the toolbar's width explicitly so the overflow logic runs.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width, height: 40, top: 0, left: 0, right: width, bottom: 40, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
  const props = {
    editor,
    editable,
    connStatus: "connected" as const,
    presentUsers: [],
    showAuthorship: true,
    onToggleAuthorship: vi.fn(),
    onImportClick: vi.fn(),
    importing: false,
    onInsertImageClick: vi.fn(),
    onExportDocx: vi.fn(),
    exporting: false,
    onDownloadPdf: vi.fn(),
    onPrint: vi.fn(),
    showComments: false,
    onToggleComments: vi.fn(),
    onAddComment: vi.fn(),
    showToc: false,
    onToggleToc: vi.fn(),
    hasSelection: false,
    focusMode: false,
    onToggleFocusMode: vi.fn(),
    pageSummary: "Short, portrait, normal margins",
    onOpenPageSetup: vi.fn(),
    onOpenHeaderFooter: vi.fn(),
    pdfBusy: false,
    zoom: 1,
    onChangeZoom: vi.fn(),
    onOpenFind: vi.fn(),
    onOpenLink: vi.fn(),
  };
  return { ...render(<Toolbar {...props} />), props };
}

describe("editor toolbar", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
  });

  it("gives every new tool a tooltip with its shortcut", () => {
    renderToolbar(makeEditor(), { width: 1500 });
    const title = (name: string) => screen.getByRole("button", { name }).getAttribute("title");
    expect(title("Strikethrough")).toBe("Strikethrough (Ctrl+Shift+X)");
    expect(title("Insert link")).toBe("Insert link (Ctrl+K)");
    expect(title("Justify")).toBe("Justify (Ctrl+Shift+J)");
    expect(title("Checklist")).toBe("Checklist (Ctrl+Shift+9)");
    expect(title("Increase indent")).toBe("Increase indent (Tab)");
    expect(title("Decrease indent")).toBe("Decrease indent (Shift+Tab)");
    expect(title("Bold")).toBe("Bold (Ctrl+B)");
    expect(title("Undo")).toBe("Undo (Ctrl+Z)");
    // Tools with no keyboard shortcut still have a text tooltip and accessible name.
    expect(title("Clear formatting")).toBe("Clear formatting");
    expect(title("Insert image")).toBe("Insert image");
  });

  it("runs the formatting commands", async () => {
    const ed = makeEditor();
    renderToolbar(ed, { width: 1500 });
    ed.commands.selectAll();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Strikethrough" }));
    expect(ed.isActive("strike")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Justify" }));
    expect(ed.isActive({ textAlign: "justify" })).toBe(true);
    await user.click(screen.getByRole("button", { name: "Increase indent" }));
    expect(ed.getJSON().content?.[0]?.attrs?.indent).toBe(1);
    await user.click(screen.getByRole("button", { name: "Checklist" }));
    // (After Select all the selection stays at document level, so isActive() is not meaningful
    // here - same as the bullet list button. Check the document itself.)
    expect(JSON.stringify(ed.getJSON())).toContain('"taskList"');
    // Clear formatting removes strike, alignment and indent in one click.
    await user.click(screen.getByRole("button", { name: "Clear formatting" }));
    expect(ed.isActive("strike")).toBe(false);
    expect(ed.isActive({ textAlign: "justify" })).toBe(false);
  });

  it("File menu: Download PDF and Print are separate one-click items (no 'Export PDF')", async () => {
    const { props } = renderToolbar(makeEditor(), { width: 1500 });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "File" }));
    expect(screen.queryByText("Export PDF")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(props.onDownloadPdf).toHaveBeenCalledTimes(1);
    expect(props.onPrint).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "File" }));
    await user.click(screen.getByRole("button", { name: "Print" }));
    expect(props.onPrint).toHaveBeenCalledTimes(1);
    expect(props.onDownloadPdf).toHaveBeenCalledTimes(1);
  });

  it("File menu: both items are disabled while a PDF is being prepared", async () => {
    const { rerender, props } = renderToolbar(makeEditor(), { width: 1500 });
    rerender(<Toolbar {...props} pdfBusy />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "File" }));
    expect(screen.getByRole("button", { name: "Preparing PDF…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
  });

  it("opens the link dialog and find from the toolbar", async () => {
    const { props } = renderToolbar(makeEditor(), { width: 1500 });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Insert link" }));
    expect(props.onOpenLink).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    await user.click(screen.getByRole("button", { name: /^Find and replace/ }));
    expect(props.onOpenFind).toHaveBeenCalledWith(true);
  });

  it("read-only view: no editing tools, but Find is available and Replace is not", async () => {
    const { props } = renderToolbar(makeEditor(), { editable: false, width: 1500 });
    expect(screen.queryByRole("button", { name: "Strikethrough" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Insert link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Checklist" })).toBeNull();
    expect(screen.getByText("Viewing (read-only)")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    await user.click(screen.getByRole("button", { name: /^Find/ }));
    expect(props.onOpenFind).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("button", { name: /Find and replace/ })).toBeNull();
  });

  it("narrow width: tools move into the More menu instead of overflowing", async () => {
    renderToolbar(makeEditor(), { width: 375 });
    // Nothing but the always-visible controls is inline at 375px...
    expect(screen.queryByRole("button", { name: "Strikethrough" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Justify" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit$/ })).toBeNull();
    // ...and they are all reachable under More.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("button", { name: "Strikethrough" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Justify" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Checklist" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insert link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Horizontal line/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Page break/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Headers and footers/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Page setup/ })).toBeInTheDocument();
    const panel = screen.getByRole("button", { name: "Strikethrough" }).closest("div[style*='fixed']") as HTMLElement;
    // Find and Find and replace both live under More when the Edit menu itself does not fit.
    expect(within(panel).getAllByRole("button", { name: /^Find/ })).toHaveLength(2);
  });
});

describe("editor toolbar: insert and page setup", () => {
  it("Insert menu: page break (with its shortcut), horizontal line, headers and footers", async () => {
    const ed = makeEditor();
    const { props } = renderToolbar(ed, { width: 1500 });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Insert$/ }));
    expect(screen.getByRole("button", { name: /^Page break/ })).toHaveTextContent("Ctrl+Enter");
    await user.click(screen.getByRole("button", { name: /^Page break/ }));
    expect(JSON.stringify(ed.getJSON())).toContain('"pageBreak"');

    await user.click(screen.getByRole("button", { name: /^Insert$/ }));
    await user.click(screen.getByRole("button", { name: /^Horizontal line/ }));
    expect(JSON.stringify(ed.getJSON())).toContain('"horizontalRule"');

    await user.click(screen.getByRole("button", { name: /^Insert$/ }));
    await user.click(screen.getByRole("button", { name: /^Headers and footers/ }));
    expect(props.onOpenHeaderFooter).toHaveBeenCalledTimes(1);
  });

  it("Format > Page setup opens the dialog; File only states the current setup", async () => {
    const { props } = renderToolbar(makeEditor(), { width: 1500 });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Format$/ }));
    await user.click(screen.getByRole("button", { name: /^Page setup/ }));
    expect(props.onOpenPageSetup).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /^File$/ }));
    expect(screen.getByText("Short, portrait, normal margins")).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio")).toBeNull(); // the old "Page size" radios are gone
  });

  it("read-only view: no Insert or Format menus, the page setup is still stated", async () => {
    renderToolbar(makeEditor(), { editable: false, width: 1500 });
    expect(screen.queryByRole("button", { name: /^Insert$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Format$/ })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^File$/ }));
    expect(screen.getByText("Short, portrait, normal margins")).toBeInTheDocument();
  });
});

describe("toolbar overflow (widths measured in a real browser)", () => {
  const collapsed = (w: number, opts = {}) => {
    const o = overflowFor(w, opts);
    return Object.entries(o).filter(([k, v]) => (k === "showCount" || k === "showPresence" ? !v : v)).map(([k]) => k);
  };

  it("shows everything inline when there is room (full screen)", () => {
    expect(collapsed(1700, { focusMode: true })).toEqual([]);
  });

  it("at the normal editor width (960px) formatting stays inline; lower-priority groups go to More", () => {
    const c = collapsed(960);
    expect(c).not.toContain("formatting");
    expect(c).not.toContain("history");
    expect(c).toContain("paragraph");
    expect(c).toContain("showCount");
  });

  it("collapses in a fixed order as the toolbar narrows, and never un-collapses at a smaller width", () => {
    const order = ["showCount", "showPresence", "review", "insert", "paragraph", "formatting", "edit", "view", "history"];
    let previous = new Set<string>();
    for (let w = 1800; w >= 300; w -= 10) {
      const now = new Set(collapsed(w, { presenceCount: 2 }));
      for (const k of previous) expect(now.has(k), `${k} came back at ${w}px`).toBe(true);
      // a group only collapses after every earlier one in the order has
      let seenOpen = false;
      for (const k of order) {
        if (!now.has(k)) seenOpen = true;
        else expect(seenOpen && k !== "showPresence" ? "open before " + k : "ok").toBe("ok");
      }
      previous = now;
    }
  });

  it("at phone width (327px = 375px minus page padding) only File and Text style stay inline", () => {
    const c = collapsed(327);
    for (const k of ["review", "insert", "paragraph", "formatting", "edit", "view", "history"]) expect(c).toContain(k);
  });

  it("the read-only view needs no editing groups", () => {
    expect(collapsed(700, { editable: false })).toEqual([]);
    expect(collapsed(500, { editable: false })).toEqual(["showCount"]);
  });
});
