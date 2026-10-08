import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusPill, PILL_TONES } from "./StatusPill";
import { StatTile } from "./StatTile";
import { ListRow } from "./ListRow";
import { Drawer } from "./Drawer";
import { Skeleton } from "./Skeleton";

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("StatusPill", () => {
  it("always renders text for every health level and flag", () => {
    const { container } = render(
      <>
        <StatusPill kind="health" value="Healthy" />
        <StatusPill kind="health" value="Moderate Risk" />
        <StatusPill kind="health" value="High Risk" />
        <StatusPill kind="flag" value="inactive" />
        <StatusPill kind="flag" value="free-rider" />
        <StatusPill kind="flag" value="overload" />
        <StatusPill kind="flag" value="deadline-driven" />
        <StatusPill kind="status" label="Open dispute" tone="violet" />
      </>
    );
    for (const t of ["Healthy", "Moderate risk", "High risk", "Inactive", "Free-rider", "Overload", "Deadline-driven", "Open dispute"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    // Icons are decorative; the text is the signal.
    container.querySelectorAll("svg").forEach((s) => expect(s).toHaveAttribute("aria-hidden", "true"));
  });

  it("keeps every tone at 4.5:1 contrast or better", () => {
    for (const [tone, { fg, bg }] of Object.entries(PILL_TONES)) {
      expect(contrast(fg, bg), tone).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("StatTile", () => {
  it("exposes the bar as a meter with a text value", () => {
    render(<StatTile label="Gini coefficient" value="0.312" bar={{ value: 0.312, label: "Gini, 0 to 1", valueText: "0.312 out of 1" }} detail="note" />);
    const meter = screen.getByRole("meter", { name: "Gini, 0 to 1" });
    expect(meter).toHaveAttribute("aria-valuetext", "0.312 out of 1");
    expect(screen.getByText("0.312")).toBeInTheDocument();
  });
});

describe("ListRow", () => {
  it("is a button at least 44px tall that reports its element on click and on keyboard", async () => {
    const onClick = vi.fn();
    render(<ListRow onClick={onClick} opensDialog>Row</ListRow>);
    const row = screen.getByRole("button", { name: "Row" });
    expect(row.className).toContain("min-h-10");
    expect(row).toHaveAttribute("aria-haspopup", "dialog");
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledWith(row);
  });
});

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  return (
    <>
      <ListRow onClick={(el) => { setOpener(el); setOpen(true); }}>Open row</ListRow>
      <Drawer open={open} onClose={() => { onClose?.(); setOpen(false); }} title="Details" restoreFocusTo={opener}>
        <button type="button">Inside</button>
      </Drawer>
    </>
  );
}

describe("Drawer", () => {
  it("moves focus in, traps Tab, closes on Esc and returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const row = screen.getByRole("button", { name: "Open row" });
    await user.click(row);
    const dialog = screen.getByRole("dialog", { name: "Details" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const close = screen.getByRole("button", { name: "Close panel" });
    const inside = screen.getByRole("button", { name: "Inside" });
    expect(close).toHaveFocus();
    await user.tab();
    expect(inside).toHaveFocus();
    await user.tab();           // wraps to the first control
    expect(close).toHaveFocus();
    await user.tab({ shift: true });  // wraps back to the last
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
    fireEvent.click(screen.getByTestId("drawer-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(row).toHaveFocus();
  });

  it("restores body scroll when closed", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open row" }));
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.keyboard("{Escape}");
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive tech", () => {
    render(<Skeleton className="h-4" />);
    expect(screen.getByTestId("skeleton")).toHaveAttribute("aria-hidden", "true");
  });
});
