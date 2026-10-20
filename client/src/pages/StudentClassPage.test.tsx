import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectCard } from "./StudentClassPage";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1 } }) }));

const asgn = (over: object = {}, group: object = {}) => ({
  id: 9, title: "Project", deadline: null, sourceType: "COMBINED", maxGroupSize: 4, description: null, attachments: [],
  myGroup: { id: 3, groupName: "Group 1", repoUrl: null, role: "MEMBER", pendingRequestCount: 0, report: null, ...group },
  myRequest: null, groups: [], ...over,
});

function renderCard(a: ReturnType<typeof asgn>) {
  const onNavigate = vi.fn(); const onManage = vi.fn();
  render(<ProjectCard asgn={a as never} token="t" onNavigate={onNavigate} onManage={onManage} onChanged={vi.fn()} />);
  return { onNavigate, onManage };
}

describe("ProjectCard for a student already in a group (R9)", () => {
  it("shows one Open group button instead of View report / FairTraze Docs / Manage group", () => {
    const { onNavigate } = renderCard(asgn());
    expect(screen.getAllByRole("button", { name: /Open group/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /View report/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /FairTraze Docs/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Manage group/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Open group/ }));
    expect(onNavigate).toHaveBeenCalledWith(3);
  });

  it("a leader sees an extra link only when join requests are waiting", () => {
    const { onManage } = renderCard(asgn({}, { role: "LEADER", pendingRequestCount: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "2 join requests waiting" }));
    expect(onManage).toHaveBeenCalledWith(3);
  });

  it("a leader with nothing waiting sees just the one button", () => {
    renderCard(asgn({}, { role: "LEADER" }));
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows team health in plain words, not 'Moderate Risk' (21)", () => {
    renderCard(asgn({}, { report: { gini: 0.31, teamHealth: "Moderate Risk", generatedAt: "2026-10-18T00:00:00Z" } }));
    expect(screen.getByText("Work is a bit uneven")).toBeInTheDocument();
    expect(screen.queryByText(/Moderate Risk|0\.31/)).toBeNull();
  });
});

describe("ProjectCard double submits", () => {
  it("sends one join request for two quick clicks and shows Sending…", async () => {
    let finish!: () => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      finish = () => resolve(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const onChanged = vi.fn();
    const a = asgn({ myGroup: null, groups: [{ id: 5, groupName: "Group 5", memberCount: 1, leaderName: "Ana", isFull: false }] });
    render(<ProjectCard asgn={a as never} token="t" onNavigate={vi.fn()} onManage={vi.fn()} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /Request to join a group/ }));
    fireEvent.click(screen.getByRole("radio"));
    const send = screen.getByRole("button", { name: "Send Request" });
    fireEvent.click(send);
    fireEvent.click(send);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sending = await screen.findByRole("button", { name: "Sending…" });
    expect(sending).toBeDisabled();
    finish();
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    vi.unstubAllGlobals();
  });
});
