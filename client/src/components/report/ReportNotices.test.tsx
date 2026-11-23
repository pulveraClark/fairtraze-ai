import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportNotices } from "./ReportNotices";
import { splitNotices, moreNoticesLabel } from "../../lib/reportNotices";

const n = (id: string, priority: number) => ({ id, priority, node: <p>{id} notice</p> });

describe("splitNotices", () => {
  it("shows the most important notice and keeps the rest in priority order (stable on ties)", () => {
    const { visible, hidden } = splitNotices([n("c", 3), n("a", 1), n("b2", 2), n("b1", 2)]);
    expect(visible.map((x) => x.id)).toEqual(["a"]);
    expect(hidden.map((x) => x.id)).toEqual(["b2", "b1", "c"]);
  });
  it("labels the disclosure", () => {
    expect(moreNoticesLabel(1)).toBe("1 more notice");
    expect(moreNoticesLabel(2)).toBe("2 more notices");
  });
});

describe("ReportNotices", () => {
  it("renders nothing without notices and no button for a single notice", () => {
    const { container, rerender } = render(<ReportNotices notices={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ReportNotices notices={[n("a", 1)]} />);
    expect(screen.getByText("a notice")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("collapses the rest behind '1 more notice' and expands on click", async () => {
    render(<ReportNotices notices={[n("b", 2), n("a", 1)]} />);
    expect(screen.getByText("a notice")).toBeVisible();
    expect(screen.queryByText("b notice")).not.toBeVisible();
    const btn = screen.getByRole("button", { name: "1 more notice" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(btn);
    expect(screen.getByText("b notice")).toBeVisible();
    expect(screen.getByRole("button", { name: "Hide notices" })).toHaveAttribute("aria-expanded", "true");
  });
});
