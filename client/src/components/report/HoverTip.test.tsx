import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HoverTip } from "./DrawerParts";

/** jsdom has no layout: give the button and the tooltip fixed geometry that tests can move. */
function mockGeometry(button: { top: number; right: number; bottom: number }, tip = { w: 224, h: 90 }) {
  const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const isButton = this.tagName === "BUTTON";
    const r = isButton ? button : { top: 0, right: 0, bottom: 0 };
    return { ...r, left: r.right - 24, width: isButton ? 24 : 0, height: isButton ? button.bottom - button.top : 0, x: 0, y: r.top, toJSON: () => ({}) } as DOMRect;
  });
  const w = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(tip.w);
  const h = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(tip.h);
  return { button, restore: () => { rect.mockRestore(); w.mockRestore(); h.mockRestore(); } };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("HoverTip (portal)", () => {
  it("links the button to the tooltip with aria-describedby only while it is shown", async () => {
    render(<HoverTip label="About X">Explanation</HoverTip>);
    const btn = screen.getByRole("button", { name: "About X" });
    expect(btn).not.toHaveAttribute("aria-describedby");
    await userEvent.click(btn);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Explanation");
    expect(btn.getAttribute("aria-describedby")).toBe(tip.id);
    expect(tip.id).not.toBe("");
    // Drawn in a portal on <body>, not inside the (possibly clipping) column.
    expect(tip.parentElement).toBe(document.body);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(btn).not.toHaveAttribute("aria-describedby");
  });

  it("places the tooltip above the button, right-aligned, and keeps it inside the viewport", async () => {
    const g = mockGeometry({ top: 300, right: 150, bottom: 324 });
    render(<HoverTip label="About X">Explanation</HoverTip>);
    await userEvent.click(screen.getByRole("button", { name: "About X" }));
    const tip = screen.getByRole("tooltip");
    // right edge 150 - width 224 would be -74: clamped to the 8px margin; above: 300 - 90 - 4.
    expect(tip.style.left).toBe("8px");
    expect(tip.style.top).toBe("206px");
    expect(tip.style.position).toBe("fixed");
    g.restore();
  });

  it("flips below the button when there is no room above", async () => {
    const g = mockGeometry({ top: 20, right: 600, bottom: 44 });
    render(<HoverTip label="About X">Explanation</HoverTip>);
    await userEvent.click(screen.getByRole("button", { name: "About X" }));
    expect(screen.getByRole("tooltip").style.top).toBe("48px");
    g.restore();
  });

  it("repositions when an ancestor scrolls and when the window is resized", async () => {
    const geo = { top: 300, right: 600, bottom: 324 };
    const g = mockGeometry(geo);
    render(<HoverTip label="About X">Explanation</HoverTip>);
    await userEvent.click(screen.getByRole("button", { name: "About X" }));
    const tip = screen.getByRole("tooltip");
    expect(tip.style.top).toBe("206px");

    geo.top = 200; geo.bottom = 224; // the button moved because a scroll box scrolled
    act(() => { fireEvent.scroll(document.body); });
    expect(tip.style.top).toBe("106px");

    geo.top = 400; geo.bottom = 424;
    act(() => { fireEvent(window, new Event("resize")); });
    expect(tip.style.top).toBe("306px");
    g.restore();
  });

  it("stops listening for scroll and resize once the tooltip is hidden", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    render(<HoverTip label="About X">Explanation</HoverTip>);
    await userEvent.click(screen.getByRole("button", { name: "About X" }));
    const added = add.mock.calls.filter(([t]) => ["scroll", "resize"].includes(String(t))).map(([t]) => String(t));
    expect(added.sort()).toEqual(["resize", "scroll"]);
    await userEvent.keyboard("{Escape}");
    const removed = remove.mock.calls.filter(([t]) => ["scroll", "resize"].includes(String(t))).map(([t]) => String(t));
    expect(removed.sort()).toEqual(["resize", "scroll"]);
  });
});
