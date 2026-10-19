import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListRow } from "./ListRow";
import { Modal } from "./Modal";

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  return (
    <>
      <ListRow onClick={(el) => { setOpener(el); setOpen(true); }}>Open row</ListRow>
      <Modal open={open} onClose={() => { onClose?.(); setOpen(false); }} title="Details" restoreFocusTo={opener}>
        <button type="button">Inside</button>
      </Modal>
    </>
  );
}

describe("Modal", () => {
  it("traps Tab, closes on Esc and returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const row = screen.getByRole("button", { name: "Open row" });
    await user.click(row);
    const dialog = screen.getByRole("dialog", { name: "Details" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const close = screen.getByRole("button", { name: "Close" });
    const inside = screen.getByRole("button", { name: "Inside" });
    expect(close).toHaveFocus();
    await user.tab();
    expect(inside).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(inside).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it("closes on backdrop click and restores focus", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const row = screen.getByRole("button", { name: "Open row" });
    await userEvent.click(row);
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(row).toHaveFocus();
  });

  it("locks body scroll while open and restores it", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open row" }));
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.keyboard("{Escape}");
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("is full screen on small screens and centered with a max width from sm up", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open row" }));
    const cls = screen.getByRole("dialog").className;
    expect(cls).toContain("h-full");
    expect(cls).toContain("w-full");
    expect(cls).toContain("sm:max-w-[1040px]");
  });
});
