import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectCard } from "./StudentClassPage";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1 } }) }));

const asgn = (over: object = {}, group: object = {}) => ({
  id: 9, title: "Project", deadline: null, sourceType: "COMBINED", maxGroupSize: 4, description: null, attachments: [],
  myGroup: { id: 3, groupName: "Group 1", repoUrl: "", role: "MEMBER", pendingRequestCount: 0, report: null, ...group },
  myRequest: null, groups: [], ...over,
});

function renderCard(a: ReturnType<typeof asgn>) {
  const onNavigate = vi.fn(); const onManage = vi.fn();
  render(<ProjectCard asgn={a as never} token="t" user={{ githubUsername: "x" }} onNavigate={onNavigate} onManage={onManage} onChanged={vi.fn()} refreshUser={async () => null} />);
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
});
