import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoleModal, canSuggestRole, type RoleSuggestionView } from "./RoleModal";

const META = {
  DEVELOPER: { label: "Developer", activeClass: "a", inactiveClass: "i" },
  DOCUMENTATION: { label: "Documentation", activeClass: "a", inactiveClass: "i" },
};

function Harness({ suggestion = null, onSubmit = () => {} }: { suggestion?: RoleSuggestionView | null; onSubmit?: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(["DEVELOPER"]);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} onClick={() => setOpen(true)}>Change</button>
      <RoleModal
        open={open}
        onClose={() => setOpen(false)}
        restoreFocusTo={ref.current}
        roleMeta={META}
        sourceType="COMBINED"
        myRoles={["DEVELOPER"]}
        suggestion={suggestion}
        draft={draft}
        onDraftChange={setDraft}
        busy={false}
        error=""
        onSubmit={onSubmit}
      />
    </>
  );
}

describe("RoleModal", () => {
  // STU-10
  it("opens, closes on Escape and returns focus to the Change button", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const change = screen.getByRole("button", { name: "Change" });
    await user.click(change);
    expect(screen.getByRole("dialog", { name: "Your role" })).toBeInTheDocument();
    expect(screen.getByText("Assigned by your leader")).toBeInTheDocument();
    expect(screen.getByText(/never change a score/i)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(change).toHaveFocus();
  });

  it("submits a changed suggestion and Cancel closes without submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Change" }));
    const submit = screen.getByRole("button", { name: /Submit suggestion/ });
    expect(submit).toBeDisabled(); // same as the current role
    await user.click(screen.getByRole("button", { name: "Documentation" }));
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the pending state and no submit button", async () => {
    const user = userEvent.setup();
    render(<Harness suggestion={{ status: "PENDING", suggestedRoles: ["DOCUMENTATION"] }} />);
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByText(/awaiting your leader/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submit suggestion/ })).not.toBeInTheDocument();
  });
});

describe("canSuggestRole", () => {
  it("is for members of Combined groups or with a pending suggestion", () => {
    expect(canSuggestRole("MEMBER", "COMBINED", null)).toBe(true);
    expect(canSuggestRole("MEMBER", "GITHUB", null)).toBe(false);
    expect(canSuggestRole("MEMBER", "GITHUB", { status: "PENDING", suggestedRoles: [] })).toBe(true);
    expect(canSuggestRole("LEADER", "COMBINED", null)).toBe(false);
  });
});
