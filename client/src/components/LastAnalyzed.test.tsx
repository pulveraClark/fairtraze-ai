import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LastAnalyzed } from "./LastAnalyzed";

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe("LastAnalyzed", () => {
  it("says when it was last analyzed and that it re-analyzes when there is new activity", () => {
    render(<LastAnalyzed analyzedAt={ago(3 * 3_600_000)} trigger="auto" />);
    expect(screen.getByText("Last analyzed 3 hours ago (automatic) · Re-analyzes when there is new activity")).toBeInTheDocument();
  });

  it("more than 7 days past the deadline, says the report is final", () => {
    render(<LastAnalyzed analyzedAt={ago(15 * 86_400_000)} trigger="manual" deadline={ago(10 * 86_400_000)} />);
    expect(screen.getByText("Last analyzed 15 days ago · Final report, no more updates")).toBeInTheDocument();
  });

  it("within 7 days past the deadline, still says it re-analyzes", () => {
    render(<LastAnalyzed analyzedAt={ago(15 * 86_400_000)} trigger="manual" deadline={ago(3 * 86_400_000)} />);
    expect(screen.getByText(/Re-analyzes when there is new activity/)).toBeInTheDocument();
  });

  it("the student line says final once closed", () => {
    render(<LastAnalyzed variant="student" analyzedAt={ago(15 * 86_400_000)} deadline={ago(10 * 86_400_000)} />);
    expect(screen.getByText("Last analyzed 15 days ago. Final report, no more updates.")).toBeInTheDocument();
  });

  it("a failed update wins over the closed wording", () => {
    render(<LastAnalyzed analyzedAt={ago(3 * 86_400_000)} updateFailed deadline={ago(30 * 86_400_000)} />);
    expect(screen.getByText("Last analyzed 3 days ago. The latest update didn't finish. It will try again later.")).toBeInTheDocument();
  });

  it("keeps the exact date and time (Manila clock) as a tooltip, since the report's Analysis tile no longer repeats the date", () => {
    render(<LastAnalyzed analyzedAt="2026-10-19T16:30:00Z" trigger="auto" />);
    expect(screen.getByText(/^Last analyzed .* ago \(automatic\)/)).toHaveAttribute("title", "Oct 20, 2026, 12:30 AM");
  });

  it("when the latest automatic update did not finish, says so calmly instead of 'Updates automatically'", () => {
    render(<LastAnalyzed analyzedAt={ago(3 * 86_400_000)} trigger="auto" updateFailed />);
    expect(screen.getByText("Last analyzed 3 days ago. The latest update didn't finish. It will try again later.")).toBeInTheDocument();
    expect(screen.queryByText(/Re-analyzes when there is new activity/)).toBeNull();
  });

  it("uses the same sentence for a student, with no cause and no blame", () => {
    render(<LastAnalyzed variant="student" analyzedAt={ago(2 * 86_400_000)} updateFailed />);
    expect(screen.getByText("Last analyzed 2 days ago. The latest update didn't finish. It will try again later.")).toBeInTheDocument();
    expect(screen.queryByText(/Updates again/)).toBeNull();
  });
});
