import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../Toast";
import { NewTaskDialog } from "./NewTaskDialog";
import { mkBoard, mkTask, resetFixtureIds } from "../../../test/taskFixtures";
import type { TaskActions } from "../../hooks/useTaskActions";

function setup(createTask: (...a: unknown[]) => Promise<unknown>) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const actions = { createTask } as unknown as TaskActions;
  render(
    <ToastProvider>
      <NewTaskDialog board={mkBoard({}, [])} actions={actions} onClose={onClose} onCreated={onCreated} />
    </ToastProvider>,
  );
  return { onClose, onCreated };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("NewTaskDialog: creating state", () => {
  beforeEach(() => resetFixtureIds());
  afterEach(() => vi.useRealTimers());

  it("shows Creating…, disables the buttons, sends one request for a double click, then closes and confirms", async () => {
    const d = deferred<ReturnType<typeof mkTask>>();
    const createTask = vi.fn(() => d.promise);
    const { onClose, onCreated } = setup(createTask);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Title"), "Draft the intro");
    const submit = screen.getByRole("button", { name: "Create task" });
    await user.dblClick(submit);

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { d.resolve(mkTask({ id: 9, title: "Draft the intro" })); });
    expect(onCreated).toHaveBeenCalledWith(9);
    expect(await screen.findByText(/created\./)).toBeInTheDocument();
  });

  it("on failure keeps the form and the text and shows a clear error, ready to try again", async () => {
    const createTask = vi.fn().mockRejectedValueOnce(new Error("The server is busy.")).mockResolvedValueOnce(mkTask({ id: 3 }));
    const { onCreated } = setup(createTask);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Title"), "Keep my words");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The server is busy.");
    expect(screen.getByLabelText("Title")).toHaveValue("Keep my words");
    expect(screen.getByRole("button", { name: "Create task" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(onCreated).toHaveBeenCalledWith(3);
  });

  it("after 15 seconds still waiting it says so and lets the person close the dialog", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const d = deferred<ReturnType<typeof mkTask>>();
    const { onClose } = setup(vi.fn(() => d.promise));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByLabelText("Title"), "Slow one");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(screen.queryByText(/Taking longer than usual/)).not.toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(screen.getByText("Taking longer than usual. The task may still appear on the board.")).toBeInTheDocument();
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toBeEnabled();
    await user.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
