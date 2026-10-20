import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetupNudgeBar } from "./SetupNudgeBar";
import type { GroupSetup } from "../lib/groupSetup";

const setup = (over: Partial<GroupSetup> = {}): GroupSetup => ({
  needsRepo: true, repoUrl: null, repoLinked: false, isLeader: true, canLinkRepo: true, canChangeRepo: false,
  viewerHasGithubUsername: false, usernames: { linked: 0, total: 3, missingNames: [] }, ...over,
});

describe("SetupNudgeBar", () => {
  it("shows progress and the leader's action, and 'Finish setup' opens the steps even after a skip", async () => {
    // The skip flag is not an input here at all: the bar never depends on it.
    localStorage.setItem("ft.setup.skip.1.7", "1");
    render(<SetupNudgeBar projectId={7} setup={setup()} token="t" onSaved={vi.fn()} />);
    expect(screen.getByText("Setup 0 of 3")).toBeTruthy();
    expect(screen.getByText("Paste the repository link")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    const dialog = screen.getByRole("dialog", { name: "Finish group setup" });
    expect(dialog.textContent).toContain("Set up your group");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    localStorage.clear();
  });

  it("renders nothing for Docs-only, complete or not-yet-loaded setup", () => {
    const { container, rerender } = render(<SetupNudgeBar projectId={7} setup={setup({ needsRepo: false })} token="t" onSaved={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    rerender(<SetupNudgeBar projectId={7} setup={setup({ repoLinked: true, usernames: { linked: 3, total: 3, missingNames: [] } })} token="t" onSaved={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    rerender(<SetupNudgeBar projectId={7} setup={undefined} token="t" onSaved={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("a member sees only their own action", () => {
    render(<SetupNudgeBar projectId={7} setup={setup({ isLeader: false, canLinkRepo: true, viewerHasGithubUsername: true })} token="t" onSaved={vi.fn()} />);
    expect(screen.getByText("Waiting for your leader to link the repository")).toBeTruthy();
  });
});
