import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ProjectScoringConfig } from "@shared/types";
import { ScoringSettingsModal } from "./ScoringSettingsModal";

vi.mock("./Toast", () => ({ useToast: () => ({ showSuccessToast: vi.fn() }) }));

const CONFIG: ProjectScoringConfig = {
  weights: { commits: 0.4, lines: 0.4, activeDays: 0.2 },
  thresholds: { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 },
  blend: { wGitHub: 0.5, wDocs: 0.5 },
};

describe("ScoringSettingsModal", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("states the project-level scope and saves to the assignment endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ config: CONFIG }) });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    render(<ScoringSettingsModal assignmentId={7} currentConfig={CONFIG} sourceType="GITHUB" onClose={() => {}} onSaved={onSaved} />);

    expect(screen.getByText("Applies to all groups in this project. Re-analyze groups to apply new settings.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/for this group/i);

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/assignments/7/scoring-config");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
  });
});
