import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GroupSetupCard } from "./GroupSetupCard";
import type { GroupSetup } from "../lib/groupSetup";

const base = (over: Partial<GroupSetup> = {}): GroupSetup => ({
  needsRepo: true, repoUrl: null, repoLinked: false, isLeader: false, canLinkRepo: true, canChangeRepo: false,
  viewerHasGithubUsername: false, usernames: { linked: 0, total: 5, missingNames: ["Ana Cruz", "Ben Lim"] }, ...over,
});
const partial = (over: Partial<GroupSetup> = {}) =>
  base({
    repoLinked: true, repoUrl: "https://github.com/acme/app", canLinkRepo: false, viewerHasGithubUsername: true,
    usernames: { linked: 3, total: 5, missingNames: ["Ana Cruz", "Ben Lim"] }, ...over,
  });

const renderCard = (setup: GroupSetup, onSaved = vi.fn()) =>
  render(<GroupSetupCard projectId={7} setup={setup} token="t" onSaved={onSaved} />);

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("GroupSetupCard states", () => {
  it("not started: 0 of 3, how-to, link field, username step", () => {
    renderCard(base());
    expect(screen.getByRole("heading", { name: "Set up your group" })).toBeInTheDocument();
    expect(screen.getByText("0 of 3 done")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Group setup progress" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByRole("heading", { name: "Create a GitHub repository" })).toBeInTheDocument();
    expect(screen.getByText("Copy the link from your browser's address bar.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open GitHub/ })).toHaveAttribute("href", "https://github.com/new");
    expect(screen.getByLabelText("Repository link")).toBeInTheDocument();
    expect(screen.getByText("0 of 5 members linked")).toBeInTheDocument();
  });

  it("partial: 2 of 3 done, repo shown, missing names listed, link to own Settings field", () => {
    renderCard(partial({ viewerHasGithubUsername: false }));
    expect(screen.getByText("2 of 3 done")).toBeInTheDocument();
    expect(screen.getByText("3 of 5 members linked")).toBeInTheDocument();
    expect(screen.getByText("Ana Cruz, Ben Lim")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "github.com/acme/app" })).toHaveAttribute("href", "https://github.com/acme/app");
    expect(screen.getByRole("link", { name: "Add my GitHub username" })).toHaveAttribute("href", "/settings?edit=github");
    expect(screen.queryByText("Copy the link from your browser's address bar.")).toBeNull(); // how-to collapses when done
  });

  it("done: renders nothing", () => {
    const { container } = renderCard(partial({ usernames: { linked: 5, total: 5, missingNames: [] } }));
    expect(container).toBeEmptyDOMElement();
  });

  it("Docs-only: renders nothing and never mentions a repository", () => {
    const { container } = renderCard(base({ needsRepo: false, canLinkRepo: false }));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("GroupSetupCard permissions", () => {
  it("a member sees the repo read-only once linked", () => {
    renderCard(partial({ isLeader: false, canChangeRepo: false }));
    expect(screen.getByText("Only the group leader can change it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change link" })).toBeNull();
    expect(screen.queryByLabelText("Repository link")).toBeNull();
  });
  it("the leader can change the link", () => {
    renderCard(partial({ isLeader: true, canChangeRepo: true }));
    fireEvent.click(screen.getByRole("button", { name: "Change link" }));
    expect(screen.getByLabelText("Repository link")).toBeInTheDocument();
    expect(screen.getByText("Changing the link tells your group and your instructor.")).toBeInTheDocument();
  });
});

describe("GroupSetupCard link field", () => {
  const type = (v: string) => fireEvent.change(screen.getByLabelText("Repository link"), { target: { value: v } });

  it("checks the format live and keeps Save disabled until it is right", () => {
    renderCard(base());
    const save = screen.getByRole("button", { name: "Save link" });
    expect(save).toBeDisabled();
    type("https://gitlab.com/acme/app");
    expect(screen.getByText(/not a GitHub link/)).toBeInTheDocument();
    expect(screen.getByLabelText("Repository link")).toHaveAttribute("aria-invalid", "true");
    expect(save).toBeDisabled();
    type("github.com/acme/app");
    expect(screen.getByText("✓ Looks right: github.com/acme/app")).toBeInTheDocument();
    expect(save).toBeEnabled();
  });

  it("saves the tidied link and tells the page", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    const onSaved = vi.fn();
    renderCard(base(), onSaved);
    type("github.com/acme/app.git");
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/groups/7/repo");
    expect(init).toMatchObject({ method: "PUT" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ repoUrl: "https://github.com/acme/app" });
  });

  it("shows the server message when the repository cannot be found, and keeps what was typed", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "We couldn't find that repository, or it is private. Make the repository public, or ask your instructor how to share it." }),
    } as Response);
    renderCard(base());
    type("https://github.com/acme/nope");
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Make the repository public, or ask your instructor how to share it\.$/);
    expect(screen.getByLabelText("Repository link")).toHaveValue("https://github.com/acme/nope");
  });
});
