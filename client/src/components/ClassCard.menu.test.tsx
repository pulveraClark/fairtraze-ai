import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClassCard } from "./ClassCard";

describe("ClassCard delete (16)", () => {
  it("has no trash icon; Delete lives in a ... menu and does not open the class", async () => {
    const onClick = vi.fn();
    const onDelete = vi.fn();
    render(<ClassCard classId={1} assignmentLabel="IT-ELEC 2 — Electives" items={[]} onClick={onClick} onDelete={onDelete} />);
    expect(screen.queryByTitle("Delete class section")).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Class options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete class section…" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows no menu when the viewer cannot delete", () => {
    render(<ClassCard classId={1} assignmentLabel="IT-ELEC 2 — Electives" items={[]} onClick={() => {}} />);
    expect(screen.queryByRole("button", { name: "Class options" })).not.toBeInTheDocument();
  });
});
