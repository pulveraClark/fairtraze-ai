import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LastAnalyzed } from "./LastAnalyzed";

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe("LastAnalyzed", () => {
  it("says when it was last analyzed and that it updates automatically", () => {
    render(<LastAnalyzed analyzedAt={ago(3 * 3_600_000)} trigger="auto" />);
    expect(screen.getByText("Last analyzed 3 hours ago (automatic) · Updates automatically")).toBeInTheDocument();
  });

  it("when the latest automatic update did not finish, says so calmly instead of 'Updates automatically'", () => {
    render(<LastAnalyzed analyzedAt={ago(3 * 86_400_000)} trigger="auto" updateFailed />);
    expect(screen.getByText("Last analyzed 3 days ago. The latest update didn't finish. It will try again tonight.")).toBeInTheDocument();
    expect(screen.queryByText(/Updates automatically/)).toBeNull();
  });

  it("uses the same sentence for a student, with no cause and no blame", () => {
    render(<LastAnalyzed variant="student" analyzedAt={ago(2 * 86_400_000)} updateFailed />);
    expect(screen.getByText("Last analyzed 2 days ago. The latest update didn't finish. It will try again tonight.")).toBeInTheDocument();
    expect(screen.queryByText(/Updates every night/)).toBeNull();
  });
});
