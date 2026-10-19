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
  it("is headed by the subject code and the EDP code in the one shared format, and still shows the join code to copy", () => {
    render(<ClassCard cls={cls} onNavigate={() => {}} />);
    expect(document.body.textContent).toContain("IT-ELEC 2 · EDP UXA634062");
    expect(screen.getByText("ABC123")).toBeInTheDocument(); // R2: the join code stays
  });
});
