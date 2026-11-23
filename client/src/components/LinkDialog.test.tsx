import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { formattingExtensions, starterKitOptions } from "../lib/formattingExtensions";
import { LinkDialog } from "./LinkDialog";

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
  document.body.querySelectorAll(":scope > div:not([data-testid])").forEach((n) => { if (!n.hasChildNodes()) n.remove(); });
});

function Harness({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button">outside before</button>
      {open && <LinkDialog editor={editor} onClose={() => setOpen(false)} />}
      <button type="button">outside after</button>
    </>
  );
}

function setup() {
  // Attached to the page so focus can really move into it.
  const host = document.body.appendChild(document.createElement("div"));
  const editor = new Editor({
    element: host,
    extensions: [StarterKit.configure({ ...starterKitOptions, undoRedo: {} }), ...formattingExtensions],
    content: "<p>hello world</p>",
  });
  editors.push(editor);
  editor.commands.setTextSelection({ from: 1, to: 6 });
  render(<Harness editor={editor} />);
  return { editor, host };
}

describe("link dialog keyboard handling", () => {
  it("starts with focus on the address field", () => {
    setup();
    expect(screen.getByLabelText("Web address")).toHaveFocus();
  });

  it("Tab and Shift+Tab cycle inside the dialog and never reach the page behind it", async () => {
    setup();
    const user = userEvent.setup();
    const url = screen.getByLabelText("Web address");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const apply = screen.getByRole("button", { name: "Apply" });
    const outside = [screen.getByRole("button", { name: "outside before" }), screen.getByRole("button", { name: "outside after" })];

    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(apply).toHaveFocus();
    await user.tab(); // wraps from the last control back to the first
    expect(url).toHaveFocus();
    await user.tab({ shift: true }); // and backwards from the first to the last
    expect(apply).toHaveFocus();
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(outside).not.toContain(document.activeElement);
    }
  });

  it("pulls focus back in if something outside grabs it", () => {
    setup();
    screen.getByRole("button", { name: "outside after" }).focus();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("Esc closes the dialog and returns focus to the editor", async () => {
    const { editor } = setup();
    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(editor.view.dom).toHaveFocus());
  });

  it("rejects an unsafe address with a message and keeps the dialog open", async () => {
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Web address"), "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/not allowed/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
