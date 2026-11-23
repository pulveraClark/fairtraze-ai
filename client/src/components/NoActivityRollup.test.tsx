import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoActivityHeaderPill } from "./NoActivityRollup";

describe("NoActivityHeaderPill", () => {
  it("uses the shared plural wording", () => {
    const { rerender } = render(<NoActivityHeaderPill count={1} />);
    expect(screen.getByText("1 group: no activity yet")).toBeInTheDocument();
    rerender(<NoActivityHeaderPill count={3} />);
    expect(screen.getByText("3 groups: no activity yet")).toBeInTheDocument();
  });
  it("renders nothing for zero", () => {
    const { container } = render(<NoActivityHeaderPill count={0} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("has the shape and size of the 'need attention' pill and no risk colour", () => {
    render(<NoActivityHeaderPill count={2} />);
    const cls = screen.getByText("2 groups: no activity yet").className;
    for (const c of ["inline-flex", "items-center", "gap-1.5", "px-2.5", "py-1", "rounded-full", "border", "text-xs", "font-semibold"]) {
      expect(cls).toContain(c);
    }
    expect(cls).not.toMatch(/red|amber|orange|yellow|green|emerald/);
    expect(screen.getByText("2 groups: no activity yet").firstElementChild?.className).toContain("rounded-full");
  });
});
