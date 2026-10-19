import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClassCard } from "./StudentPage";
import type { EnrolledClass } from "../hooks/useStudentClassesQuery";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1 } }) }));

const cls = {
  id: 5, subjectCode: "IT-ELEC 2", subjectName: "Electives", edpCode: "UXA634062", department: null,
  joinCode: "ABC123", assignments: [],
} as unknown as EnrolledClass;

describe("student dashboard class card (23)", () => {
  it("is headed by the class code, not the EDP code, and still shows the class code to copy", () => {
    render(<ClassCard cls={cls} onNavigate={() => {}} />);
    expect(screen.getByText("IT-ELEC 2")).toBeInTheDocument();
    expect(screen.queryByText("UXA634062")).not.toBeInTheDocument();
    expect(screen.getByText("ABC123")).toBeInTheDocument(); // R2: the join code stays
  });
});
