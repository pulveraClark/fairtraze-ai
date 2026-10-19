import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InfoTip } from "./InfoTip";

describe("InfoTip", () => {
  it("opens on click, closes on Esc and returns focus to the button", async () => {
    const user = userEvent.setup();
    render(<InfoTip label="About roles">Short help.</InfoTip>);
    const btn = screen.getByRole("button", { name: "About roles" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.click(btn);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Short help.");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(btn).toHaveFocus();
  });

  it("has no Help link unless helpHref is given", async () => {
    const user = userEvent.setup();
    render(<InfoTip label="About roles">Short help.</InfoTip>);
    await user.click(screen.getByRole("button", { name: "About roles" }));
    expect(screen.queryByRole("link", { name: "More in Help" })).toBeNull();
  });

  it("adds a 'More in Help' link that opens in a new tab, so a form or dialog is never replaced", async () => {
    const user = userEvent.setup();
    render(<InfoTip label="About shares" helpHref="/help#shares">Short help.</InfoTip>);
    await user.click(screen.getByRole("button", { name: "About shares" }));
    const link = screen.getByRole("link", { name: "More in Help" });
    expect(link).toHaveAttribute("href", "/help#shares");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    // The link is the next stop after the button, and the popover keeps its accessible name.
    await user.tab();
    expect(link).toHaveFocus();
    expect(screen.getByRole("group", { name: "About shares" })).toBeInTheDocument();
  });

  it("Esc closes only the tip, so a dialog around it stays open", async () => {
    const user = userEvent.setup();
    const dialogEsc = vi.fn();
    document.addEventListener("keydown", dialogEsc);
    render(<InfoTip label="About roles">Short help.</InfoTip>);
    await user.click(screen.getByRole("button", { name: "About roles" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(dialogEsc).not.toHaveBeenCalled(); // the tip took this Esc
    await user.keyboard("{Escape}");
    expect(dialogEsc).toHaveBeenCalledTimes(1); // with no tip open, Esc reaches the dialog as before
    document.removeEventListener("keydown", dialogEsc);
  });
});
