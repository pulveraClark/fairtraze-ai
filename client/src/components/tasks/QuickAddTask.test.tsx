import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickAddTask } from "./QuickAddTask";

function setup(onAdd = vi.fn(async (_t: string) => "Added FT-1.")) {
  render(<QuickAddTask label="To do" onAdd={onAdd} />);
  return { onAdd, user: userEvent.setup() };
}
const openIt = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Add task to To do" }));

describe("QuickAddTask", () => {
  it("the button opens a focused field", async () => {
    const { user } = setup();
    await openIt(user);
    expect(screen.getByLabelText("Add a task to To do")).toHaveFocus();
  });

  it("Enter creates, clears, keeps the field open and focused, and announces the result", async () => {
    const { user, onAdd } = setup();
    await openIt(user);
    const field = screen.getByLabelText("Add a task to To do");
    await user.type(field, "  Write intro  {Enter}");
    expect(onAdd).toHaveBeenCalledWith("Write intro");
    expect(await screen.findByRole("status")).toHaveTextContent("Added FT-1.");
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
  });

  it("Enter on an empty field does nothing", async () => {
    const { user, onAdd } = setup();
    await openIt(user);
    await user.type(screen.getByLabelText("Add a task to To do"), "   {Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("Esc closes and discards, returning focus to the button", async () => {
    const { user, onAdd } = setup();
    await openIt(user);
    await user.type(screen.getByLabelText("Add a task to To do"), "draft{Escape}");
    expect(screen.queryByLabelText("Add a task to To do")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task to To do" })).toHaveFocus();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("blur closes an empty field but keeps typed text", async () => {
    const { user } = setup();
    await openIt(user);
    await user.tab();
    expect(screen.queryByLabelText("Add a task to To do")).not.toBeInTheDocument();
    await openIt(user);
    await user.type(screen.getByLabelText("Add a task to To do"), "keep me");
    await user.tab();
    expect(screen.getByLabelText("Add a task to To do")).toHaveValue("keep me");
  });

  it("a failure keeps the text and shows the reason", async () => {
    const { user } = setup(vi.fn(async () => { throw new Error("Too many tasks created. Try again in a minute."); }));
    await openIt(user);
    await user.type(screen.getByLabelText("Add a task to To do"), "Oops{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many tasks created");
    expect(screen.getByLabelText("Add a task to To do")).toHaveValue("Oops");
  });

  it("does not submit twice while the first create is running", async () => {
    let finish!: () => void;
    const onAdd = vi.fn(() => new Promise<string>((res) => { finish = () => res("Added."); }));
    const { user } = setup(onAdd);
    await openIt(user);
    await user.type(screen.getByLabelText("Add a task to To do"), "Once{Enter}{Enter}");
    expect(onAdd).toHaveBeenCalledTimes(1);
    finish();
  });
});
