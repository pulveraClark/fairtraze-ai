import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PdfProgressPanel } from "./PdfProgressPanel";

describe("PdfProgressPanel", () => {
  it("shows what is happening, a percentage with text (not colour alone) and a progress bar", () => {
    render(<PdfProgressPanel purpose="download" fraction={0.4} label="Writing sheet 3 of 8…" onCancel={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Preparing PDF");
    expect(screen.getByText("Writing sheet 3 of 8…")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "PDF progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("clamps the fraction and says when it is for printing", () => {
    const { rerender } = render(<PdfProgressPanel purpose="print" fraction={1.7} label="x" onCancel={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Preparing PDF for printing");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    rerender(<PdfProgressPanel purpose="print" fraction={-3} label="x" onCancel={vi.fn()} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("Cancel calls back and is a real, keyboard-reachable button", async () => {
    const onCancel = vi.fn();
    render(<PdfProgressPanel purpose="download" fraction={0.1} label="x" onCancel={onCancel} />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
