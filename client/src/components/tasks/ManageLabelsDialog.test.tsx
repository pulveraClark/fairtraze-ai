import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManageLabelsDialog } from "./ManageLabelsDialog";
import { mkBoard, mkTask, resetFixtureIds } from "../../../test/taskFixtures";

type Handlers = Partial<{
  onCreate: () => Promise<unknown>;
  onRename: () => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}>;

function renderDialog(handlers: Record<string, unknown> = {}, tasks = [] as ReturnType<typeof mkTask>[]) {
  const props = {
    onCreate: vi.fn(async () => ({})),
    onRename: vi.fn(async () => ({})),
    onDelete: vi.fn(async () => undefined),
    onClose: vi.fn(),
    ...(handlers as Handlers),
  };
  render(<ManageLabelsDialog board={mkBoard({ labels: [{ id: 1, name: "Docs", color: "teal" }] }, tasks)} {...props} />);
  return { user: userEvent.setup(), ...props };
}

beforeEach(() => { resetFixtureIds(); });

describe("ManageLabelsDialog", () => {
  it("lists the labels and adds a new one", async () => {
    const { user, onCreate } = renderDialog();
    expect(screen.getByText("Docs")).toBeInTheDocument();
    await user.type(screen.getByLabelText("New label"), "Bug");
    await user.click(screen.getByRole("button", { name: "Add label" }));
    expect(onCreate).toHaveBeenCalledWith({ name: "Bug", color: "blue" });
  });

  it("renames a label", async () => {
    const { user, onRename } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Rename Docs" }));
    const input = screen.getByLabelText("New name for Docs");
    await user.clear(input);
    await user.type(input, "Writing");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onRename).toHaveBeenCalledWith(1, "Writing");
    expect(screen.queryByLabelText("New name for Docs")).not.toBeInTheDocument();
  });

  it("rename shows the server's reason (duplicate name) and stays open", async () => {
    const onRename = vi.fn(async () => { throw new Error("A label with that name already exists."); });
    const { user } = renderDialog({ onRename });
    await user.click(screen.getByRole("button", { name: "Rename Docs" }));
    await user.type(screen.getByLabelText("New name for Docs"), "x");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A label with that name already exists.");
    expect(screen.getByLabelText("New name for Docs")).toBeInTheDocument();
  });

  it("Delete asks first, says how many tasks use the label, and only deletes after Delete label", async () => {
    const { user, onDelete } = renderDialog({}, [mkTask({ id: 1, labelIds: [1] }), mkTask({ id: 2, labelIds: [1] }), mkTask({ id: 3 })]);
    await user.click(screen.getByRole("button", { name: "Delete Docs" }));
    expect(screen.getByRole("alertdialog", { name: /Delete the label "Docs"/ })).toBeInTheDocument();
    expect(screen.getByText(/removed from 2 tasks/)).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete Docs" }));
    await user.click(screen.getByRole("button", { name: "Delete label" }));
    expect(onDelete).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
