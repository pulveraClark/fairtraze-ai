import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OverflowMenu } from "./OverflowMenu";
import { ConfirmDialog } from "./ConfirmDialog";

describe("OverflowMenu (16)", () => {
  it("opens a menu of named actions, runs one and closes", async () => {
    const onSelect = vi.fn();
    render(<OverflowMenu label="More actions" items={[{ label: "Delete thing…", tone: "danger", onSelect }]} />);
    const user = userEvent.setup();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("button", { name: "More actions" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("menuitem", { name: "Delete thing…" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("Escape closes it and returns focus to the button; arrows move between items", async () => {
    render(<OverflowMenu label="More actions" items={[{ label: "One", onSelect: vi.fn() }, { label: "Two", onSelect: vi.fn() }]} />);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "More actions" });
    await user.click(trigger);
    screen.getByRole("menuitem", { name: "One" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Two" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("inside a clickable card, using the menu does not also click the card", async () => {
    const card = vi.fn();
    const select = vi.fn();
    render(
      <div role="button" tabIndex={0} onClick={card} onKeyDown={(e) => { if (e.key === "Enter") card(); }}>
        <OverflowMenu label="Card options" items={[{ label: "Delete", onSelect: select }]} />
      </div>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Card options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(select).toHaveBeenCalled();
    expect(card).not.toHaveBeenCalled();
    screen.getByRole("button", { name: "Card options" }).focus();
    await user.keyboard("{Enter}");
    expect(card).not.toHaveBeenCalled();
  });
});

describe("ConfirmDialog (16)", () => {
  it("asks first: nothing happens until Confirm, and Cancel and Escape back out", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Delete Ana?" confirmLabel="Delete user" onConfirm={onConfirm} onCancel={onCancel}>This cannot be undone.</ConfirmDialog>);
    const user = userEvent.setup();
    expect(screen.getByRole("alertdialog", { name: "Delete Ana?" })).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Delete user" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons and shows the busy label while the action runs", () => {
    render(<ConfirmDialog title="T" confirmLabel="Delete" busyLabel="Deleting…" busy onConfirm={vi.fn()} onCancel={vi.fn()}>x</ConfirmDialog>);
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
