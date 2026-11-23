import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthorshipLegend } from "./DocumentEditorToolbar";

describe("AuthorshipLegend", () => {
  it("lists each author by name with a swatch that carries their underline style", () => {
    const { container } = render(
      <AuthorshipLegend users={[{ id: 5, name: "Ana" }, { id: 12, name: "Ben" }]} memberIds={[5, 12]} />
    );
    expect(screen.getByRole("list", { name: "Who wrote what" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("Ben")).toBeTruthy();
    const swatches = Array.from(container.querySelectorAll('[aria-hidden="true"]')) as HTMLElement[];
    expect(swatches[0]!.textContent).toBe("AN");
    expect(swatches[1]!.textContent).toBe("BE");
    expect(swatches[0]!.getAttribute("title")).toBe("Written by Ana");
    expect(swatches[0]!.style.textDecoration).toContain("solid");
    expect(swatches[1]!.style.textDecoration).toContain("dashed");
  });

  it("renders nothing when nobody has written yet", () => {
    const { container } = render(<AuthorshipLegend users={[]} memberIds={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
