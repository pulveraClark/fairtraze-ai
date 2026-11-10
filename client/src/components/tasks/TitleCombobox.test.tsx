import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { TaskSuggestion } from "@shared/taskTypes";
import { TitleCombobox } from "./TitleCombobox";

const S: TaskSuggestion[] = [
  { key: "a", text: "Has a login page" },
  { key: "b", text: "Has a survey" },
  { key: "c", text: "Export results to PDF" },
];

function Harness({ suggestions = S, onPick = () => {}, autoFocus = false }: { suggestions?: TaskSuggestion[]; onPick?: (s: TaskSuggestion) => void; autoFocus?: boolean }) {
  const [v, setV] = useState("");
  return (
    <TitleCombobox id="t" value={v} onChange={setV} suggestions={suggestions} autoFocus={autoFocus}
      onPick={(s) => { setV(s.text); onPick(s); }} />
  );
}

describe("TitleCombobox", () => {
  it("is a plain text box with no chevron when there is nothing to suggest", () => {
    render(<Harness suggestions={[]} />);
    const input = screen.getByPlaceholderText("Type a title or pick from the project instructions");
    expect(input).not.toHaveAttribute("role");
    expect(screen.queryByRole("button", { name: /project instructions/i })).toBeNull();
  });

  it("stays closed on autofocus and opens on click, with ARIA wiring and the option count", async () => {
    const user = userEvent.setup();
    render(<Harness autoFocus />);
    const box = screen.getByRole("combobox");
    expect(box).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.click(box);
    expect(box).toHaveAttribute("aria-expanded", "true");
    expect(box).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByText("From the project instructions")).toBeInTheDocument();
    expect(screen.getByText("3 suggestions from the project instructions")).toBeInTheDocument();
  });

  it("opens from the chevron and from ArrowDown", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Show project instructions" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("filters as you type, and closes when nothing matches while keeping the typed text", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole("combobox");
    await user.type(box, "survey");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.type(box, " xyz");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box).toHaveValue("survey xyz");
  });

  it("arrows move, Enter picks, Esc closes and keeps the text", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const box = screen.getByRole("combobox");
    await user.click(box);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(box).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[1]!.id);
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith(S[1]);
    expect(box).toHaveValue("Has a survey");
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.clear(box);
    await user.type(box, "Ha");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box).toHaveValue("Ha");
  });

  it("picking with the mouse selects the item; rows are at least 44px tall", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await user.click(screen.getByRole("combobox"));
    const row = screen.getAllByRole("option")[0]!;
    expect(row.className).toContain("min-h-11");
    await user.click(row);
    expect(onPick).toHaveBeenCalledWith(S[0]);
  });
});
