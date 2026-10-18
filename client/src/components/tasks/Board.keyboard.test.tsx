import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BoardResponse, BoardTask, TaskStatus } from "@shared/taskTypes";
import { createElement, type ComponentProps } from "react";
import { act } from "@testing-library/react";
import { Board } from "./Board";
import { columnsFromTasks, type Placement } from "../../lib/tasks/placement";
import { ASSIGNEE_PERMS, mkBoard, mkTask, NO_PERMS, resetFixtureIds } from "../../../test/taskFixtures";

// Capture the props Board gives DndContext, so the drag handlers can also be driven directly.
const captured: { props: ComponentProps<typeof import("@dnd-kit/core").DndContext> | null } = { props: null };
vi.mock("@dnd-kit/core", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/core")>("@dnd-kit/core");
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      captured.props = props;
      return createElement(actual.DndContext, props);
    },
  };
});

// jsdom has no layout, and dnd-kit's keyboard sensor moves a card by measuring rectangles. This
// gives every column and card a fixed position (columns side by side, cards stacked) so the real
// keyboard flow (Space to pick up, arrows to move, Space to drop, Escape to cancel) can run.
const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];

function rectFor(el: Element): DOMRect {
  // The page itself is the scroll container: a real viewport, otherwise dnd-kit clamps every move to nothing.
  if (el === document.documentElement || el === document.body) return new DOMRect(0, 0, 1400, 900);
  const col = el.closest("section[aria-labelledby^='col-title-']");
  if (!col) {
    // The drag overlay (the floating copy of the card) is outside every column: give it a card's size.
    return el.querySelector(":scope > [data-testid^='task-card-']") ? new DOMRect(0, 40, 280, 90) : new DOMRect(0, 0, 0, 0);
  }
  const idx = STATUSES.findIndex((s) => col.getAttribute("aria-labelledby") === `col-title-${s}`);
  const left = idx * 300;
  if (el === col) return new DOMRect(left, 0, 280, 700);
  if (el.tagName === "UL") return new DOMRect(left, 40, 280, 600);
  if (el.tagName === "LI") {
    const row = Array.from(el.parentElement!.children).indexOf(el);
    return new DOMRect(left, 40 + row * 100, 280, 90);
  }
  return new DOMRect(0, 0, 0, 0);
}

// dnd-kit measures the floating copy of the card through ResizeObserver, which jsdom does not have.
class FakeResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(target: Element) {
    const r = target.getBoundingClientRect();
    queueMicrotask(() => this.cb([{ target, contentRect: r } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver));
  }
  unobserve() {}
  disconnect() {}
}

let restore: (() => void) | null = null;
beforeEach(() => {
  resetFixtureIds();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () { return rectFor(this); };
  restore = () => { HTMLElement.prototype.getBoundingClientRect = original; };
});
afterEach(() => { restore?.(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function renderBoard(board: BoardResponse, tasks: BoardTask[], handlers: Partial<{ onMove: ReturnType<typeof vi.fn>; onDenied: ReturnType<typeof vi.fn> }> = {}) {
  const onMove = handlers.onMove ?? vi.fn();
  const onDenied = handlers.onDenied ?? vi.fn();
  render(
    <Board board={board} tasks={tasks} today="2026-10-16" onOpen={vi.fn()} onMove={onMove} onDenied={onDenied} />,
  );
  return { onMove, onDenied };
}

const grip = (key: string) => screen.getByRole("button", { name: new RegExp(`^Move ${key}\\.`) });

describe("keyboard drag and drop", () => {
  it("Space picks up the card from its grip and announces it (real keyboard sensor)", async () => {
    const tasks = [mkTask({ id: 1, title: "First" })];
    renderBoard(mkBoard({}, tasks), tasks);
    const user = userEvent.setup();
    grip("FT-1").focus();
    await user.keyboard(" ");
    expect(grip("FT-1")).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(document.querySelector("[id^='DndLiveRegion']")?.textContent).toMatch(/FT-1/));
    expect(document.body.textContent).toMatch(/To pick up a task, focus its grip and press Space/);
  });

  it("Escape cancels: nothing is moved and the card stays in its column", async () => {
    const tasks = [mkTask({ id: 1, title: "First" })];
    const { onMove } = renderBoard(mkBoard({}, tasks), tasks);
    const user = userEvent.setup();

    grip("FT-1").focus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(document.querySelector("[id^='DndLiveRegion']")?.textContent).toMatch(/Move cancelled/));
    expect(onMove).not.toHaveBeenCalled();
    expect(within(screen.getByRole("region", { name: "Task board" }).querySelector("section[aria-labelledby='col-title-TODO']") as HTMLElement).getByText("First")).toBeInTheDocument();
  });

  // The handlers below are what the keyboard, mouse and touch sensors all end up calling.
  const drag = {
    start: (id: number) => act(() => captured.props!.onDragStart!({ active: { id } } as never)),
    over: (id: number, overId: string | number) => act(() => captured.props!.onDragOver!({
      active: { id, rect: { current: { translated: null, initial: null } } }, over: { id: overId, rect: { top: 0, height: 0 } },
    } as never)),
    end: (id: number, overId: string | number | null) => act(() => captured.props!.onDragEnd!({
      active: { id }, over: overId === null ? null : { id: overId },
    } as never)),
  };

  it("moving a card into another column reports one move, with where it came from (for Undo)", () => {
    const tasks = [mkTask({ id: 1, title: "First" }), mkTask({ id: 2, title: "Second" })];
    const { onMove } = renderBoard(mkBoard({}, tasks), tasks);
    drag.start(1);
    drag.over(1, "col:IN_PROGRESS");
    // While dragging, the card already shows in the new column.
    expect(within(document.querySelector("section[aria-labelledby='col-title-IN_PROGRESS']") as HTMLElement).getByText("First")).toBeInTheDocument();
    drag.end(1, "col:IN_PROGRESS");

    expect(onMove).toHaveBeenCalledTimes(1);
    const [task, to, previous] = onMove.mock.calls[0] as [BoardTask, Placement, Placement | null];
    expect(task.id).toBe(1);
    expect(to).toEqual({ status: "IN_PROGRESS", afterId: null, beforeId: null });
    expect(previous).toEqual({ status: "TODO", afterId: null, beforeId: 2 });
  });

  it("dropping between two cards of another column reports the neighbour to sit after", () => {
    const tasks = [
      mkTask({ id: 1, title: "Mover" }),
      mkTask({ id: 2, title: "A", status: "IN_PROGRESS", position: 1024 }),
      mkTask({ id: 3, title: "B", status: "IN_PROGRESS", position: 2048 }),
    ];
    const { onMove } = renderBoard(mkBoard({}, tasks), tasks);
    drag.start(1);
    drag.over(1, 3); // over card B: goes in at B's index, i.e. before B
    drag.end(1, 1); // B moved down, so the pointer is now over the dragged card's own slot
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0]![1]).toEqual({ status: "IN_PROGRESS", afterId: 2, beforeId: null });
  });

  it("reordering inside a column reports the new neighbour; dropping where it started reports nothing", () => {
    const tasks = [mkTask({ id: 1 }), mkTask({ id: 2 }), mkTask({ id: 3 })];
    const { onMove } = renderBoard(mkBoard({}, tasks), tasks);
    drag.start(1);
    drag.end(1, 3); // dropped on the last card: moves to the end
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0]![1]).toEqual({ status: "TODO", afterId: 3, beforeId: null });

    onMove.mockClear();
    drag.start(2);
    drag.end(2, 2);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("an assignee cannot drop into Done: the card is not moved and the reason is shown", () => {
    const tasks = [mkTask({ id: 1, title: "Mine", status: "IN_REVIEW", assignedToUserId: 2, permissions: ASSIGNEE_PERMS })];
    const board = mkBoard({ viewer: { userId: 2, isLeader: false, isMember: true, readOnly: false, canCreate: true, canManageBoard: false } }, tasks);
    const { onMove, onDenied } = renderBoard(board, tasks);
    drag.start(1);
    drag.over(1, "col:DONE");
    // It stays in In review while the Done column shows it is not allowed.
    expect(within(document.querySelector("section[aria-labelledby='col-title-IN_REVIEW']") as HTMLElement).getByText("Mine")).toBeInTheDocument();
    expect(screen.getByText("Not allowed for this task")).toBeInTheDocument();
    drag.end(1, "col:DONE");
    expect(onMove).not.toHaveBeenCalled();
    expect(onDenied).toHaveBeenCalledWith("Only the group leader can mark a task Done.");
  });

  it("cancelling a drag puts the card back and reports nothing", () => {
    const tasks = [mkTask({ id: 1, title: "First" })];
    const { onMove } = renderBoard(mkBoard({}, tasks), tasks);
    drag.start(1);
    drag.over(1, "col:DONE");
    act(() => captured.props!.onDragCancel!({ active: { id: 1 } } as never));
    expect(onMove).not.toHaveBeenCalled();
    expect(within(document.querySelector("section[aria-labelledby='col-title-TODO']") as HTMLElement).getByText("First")).toBeInTheDocument();
  });

  it("a card the viewer cannot move has no grip, so it cannot be picked up", () => {
    const tasks = [mkTask({ id: 1, title: "Locked", assignedToUserId: 3, permissions: NO_PERMS })];
    renderBoard(mkBoard({ viewer: { userId: 2, isLeader: false, isMember: true, readOnly: false, canCreate: true, canManageBoard: false } }, tasks), tasks);
    expect(screen.queryByRole("button", { name: /^Move FT-1/ })).not.toBeInTheDocument();
  });

  it("keeps the resting order intact (columnsFromTasks) when nothing is dragged", () => {
    const tasks = [mkTask({ id: 1, position: 2048 }), mkTask({ id: 2, position: 1024 })];
    expect(columnsFromTasks(tasks).TODO).toEqual([2, 1]);
  });
});
