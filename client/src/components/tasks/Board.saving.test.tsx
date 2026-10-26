import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BoardResponse, BoardTask, TaskStatus } from "@shared/taskTypes";
import { createElement, type ComponentProps } from "react";
import { act } from "@testing-library/react";
import { Board } from "./Board";
import { mkBoard, mkTask, resetFixtureIds } from "../../../test/taskFixtures";

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

function renderBoard(board: BoardResponse, tasks: BoardTask[], savingIds: number[], onSavingBlocked = vi.fn()) {
  const onMove = vi.fn();
  render(
    <Board board={board} tasks={tasks} today="2026-10-16" onOpen={vi.fn()} onMove={onMove} onDenied={vi.fn()} savingIds={savingIds} onSavingBlocked={onSavingBlocked} />,
  );
  return { onMove, onSavingBlocked };
}

const grip = (key: string) => screen.getByRole("button", { name: new RegExp(`^Move ${key}\\.`) });

describe("a card whose move is still saving", () => {
  const tasks = () => [mkTask({ id: 1, title: "First" }), mkTask({ id: 2, title: "Second" })];

  it("shows a spinner and 'Saving…' on that card only, in a polite live region, and fades it", () => {
    renderBoard(mkBoard({}, tasks()), tasks(), [1]);
    const saving = screen.getByTestId("task-card-1");
    expect(within(saving).getByText("Saving…")).toBeInTheDocument();
    expect(within(saving).getByText("Saving…").closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
    expect(within(screen.getByTestId("task-card-2")).queryByText("Saving…")).toBeNull();
    expect((saving.closest("li") as HTMLElement).style.opacity).toBe("0.7");
  });

  it("cannot be picked up: pressing Space or the pointer only says it is still saving", async () => {
    const { onSavingBlocked } = renderBoard(mkBoard({}, tasks()), tasks(), [1]);
    const user = userEvent.setup();
    grip("FT-1").focus();
    await user.keyboard(" ");
    expect(grip("FT-1")).not.toHaveAttribute("aria-pressed", "true");
    expect(onSavingBlocked).toHaveBeenCalledTimes(1);
    await user.pointer({ keys: "[MouseLeft>]", target: grip("FT-1") });
    expect(onSavingBlocked).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[id^='DndLiveRegion']")?.textContent ?? "").not.toMatch(/Picked up FT-1/);
  });

  it("leaves the other cards draggable", async () => {
    renderBoard(mkBoard({}, tasks()), tasks(), [1]);
    const user = userEvent.setup();
    grip("FT-2").focus();
    await user.keyboard(" ");
    expect(grip("FT-2")).toHaveAttribute("aria-pressed", "true");
  });

  it("is draggable again once the save settles", async () => {
    const { rerender } = render(
      <Board board={mkBoard({}, tasks())} tasks={tasks()} today="2026-10-16" onOpen={vi.fn()} onMove={vi.fn()} onDenied={vi.fn()} savingIds={[1]} />,
    );
    rerender(<Board board={mkBoard({}, tasks())} tasks={tasks()} today="2026-10-16" onOpen={vi.fn()} onMove={vi.fn()} onDenied={vi.fn()} savingIds={[]} />);
    expect(screen.queryByText("Saving…")).toBeNull();
    const user = userEvent.setup();
    grip("FT-1").focus();
    await user.keyboard(" ");
    expect(grip("FT-1")).toHaveAttribute("aria-pressed", "true");
  });
});
