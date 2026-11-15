import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectCardHeader } from "./ProjectCardHeader";

// Structure of the header as a list of row class signatures, to prove every card has the same layout.
function layoutOf(container: HTMLElement) {
  const root = container.querySelector('[data-testid="project-card-header"]')!;
  return Array.from(root.children).map((c) => c.className);
}

describe("ProjectCardHeader", () => {
  it("EDITOR and COMBINED cards (with or without the chip) share one layout", () => {
    const a = render(<ProjectCardHeader sourceType="EDITOR" title="Docs" attentionLabel={null} onDelete={() => {}} />);
    const b = render(<ProjectCardHeader sourceType="COMBINED" title="Docs and code" attentionLabel="1 group needs attention" onDelete={() => {}} />);
    expect(layoutOf(a.container)).toEqual(layoutOf(b.container));
    expect(layoutOf(a.container)).toHaveLength(3); // top row, chip row, title
  });

  it("the chip row keeps its height with no chip, and the chip has text plus an icon", () => {
    const { container, rerender } = render(<ProjectCardHeader sourceType="COMBINED" title="T" attentionLabel={null} />);
    expect(container.querySelector(".min-h-6")).not.toBeNull();
    rerender(<ProjectCardHeader sourceType="COMBINED" title="T" attentionLabel="2 groups need attention" />);
    expect(screen.getByText("2 groups need attention")).toBeInTheDocument();
    expect(screen.getByText("⚠")).toHaveAttribute("aria-hidden", "true");
  });

  it("the delete button has an accessible name and does not leak the click to the card", async () => {
    const onDelete = vi.fn();
    const onCard = vi.fn();
    render(
      <div onClick={onCard}>
        <ProjectCardHeader sourceType="EDITOR" title="Case study" attentionLabel={null} onDelete={(e) => { e.stopPropagation(); onDelete(); }} />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete project Case study" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onCard).not.toHaveBeenCalled();
  });

  it("no delete button for people who cannot delete, same top row", () => {
    const a = render(<ProjectCardHeader sourceType="EDITOR" title="T" attentionLabel={null} />);
    expect(screen.queryByRole("button")).toBeNull();
    const b = render(<ProjectCardHeader sourceType="EDITOR" title="T" attentionLabel={null} onDelete={() => {}} />);
    expect(layoutOf(a.container)).toEqual(layoutOf(b.container));
  });
});
