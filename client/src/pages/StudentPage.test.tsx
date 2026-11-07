import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClassCard } from "./StudentPage";
import type { EnrolledClass } from "../hooks/useStudentClassesQuery";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1 } }) }));

const cls = {
  id: 5, subjectCode: "IT-ELEC 2", subjectName: "Electives", edpCode: "UXA634062", department: null,
  joinCode: "ABC123", assignments: [],
} as unknown as EnrolledClass;

describe("student dashboard class card: last analyzed", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("says 'Last analyzed 2 days ago' beside the health pill, not 'Analyzed <date>'", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    const withReport = {
      ...cls,
      assignments: [{ id: 1, title: "P", myGroup: { id: 3, groupName: "G", role: "MEMBER", report: { teamHealth: "Healthy", generatedAt: "2026-10-18T12:00:00Z" } } }],
    } as unknown as EnrolledClass;
    render(<ClassCard cls={withReport} onNavigate={() => {}} />);
    expect(screen.getByText("Last analyzed 2 days ago")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Analyzed \d|Gini/);
  });
});

describe("student dashboard class card (23)", () => {
  it("is headed by the subject code and the EDP code in the one shared format, and still shows the join code to copy", () => {
    render(<ClassCard cls={cls} onNavigate={() => {}} />);
    expect(document.body.textContent).toContain("IT-ELEC 2 · EDP UXA634062");
    expect(screen.getByText("ABC123")).toBeInTheDocument(); // R2: the join code stays
  });
});
