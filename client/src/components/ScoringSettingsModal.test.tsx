import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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

  it("keeps the consequence lines visible and moves the explanations into (?) tips that describe what the code does", () => {
    render(<ScoringSettingsModal assignmentId={7} currentConfig={CONFIG} sourceType="GITHUB" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.queryByText(/math stays the same/i)).toBeNull();
    expect(screen.queryByText(/must sum to 1/i)).toBeNull();
    expect(screen.getByText(/Saving marks every group's report as outdated until you re-analyze\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "About lines added" }));
    const tip = screen.getByRole("group", { name: "About lines added" });
    expect(tip).toHaveTextContent(/file type/);
    expect(tip).toHaveTextContent(/comments a quarter and blank lines nothing/); // line-type weighting (rules version 2)
    expect(within(tip).getByRole("link", { name: "More in Help" })).toHaveAttribute("href", "/help#shares");
  });

  const renderModal = (sourceType = "GITHUB") =>
    render(<ScoringSettingsModal assignmentId={7} currentConfig={CONFIG} sourceType={sourceType} onClose={() => {}} onSaved={() => {}} />);
  const numberInput = (i: number) => screen.getAllByRole("spinbutton")[i] as HTMLInputElement;

  it("shows a live total; an off total says how far, disables Save and Balance fixes it", () => {
    renderModal();
    expect(screen.getByRole("status")).toHaveTextContent("Weights total: 1.00 of 1.00");
    expect(screen.queryByRole("button", { name: "Balance" })).toBeNull();

    fireEvent.change(numberInput(2), { target: { value: "0.1" } });
    expect(screen.getByRole("status")).toHaveTextContent("Weights total: 0.90 of 1.00");
    expect(screen.getByRole("status")).toHaveTextContent("0.10 short");
    expect((screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Balance" }));
    expect(screen.getByRole("status")).toHaveTextContent("Weights total: 1.00 of 1.00");
    expect((screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(false);
    expect(numberInput(0).value).toBe("0.45");
  });

  it("an over total says so, and the blend has its own Balance", () => {
    renderModal("COMBINED");
    fireEvent.change(numberInput(3), { target: { value: "0.8" } });
    const blend = screen.getAllByRole("status").find((n) => /Blend total/.test(n.textContent ?? ""))!;
    expect(blend).toHaveTextContent("Blend total: 1.30 of 1.00");
    expect(blend).toHaveTextContent("0.30 over");
    fireEvent.click(screen.getByRole("button", { name: "Balance" }));
    expect(screen.getAllByRole("status").find((n) => /Blend total/.test(n.textContent ?? ""))).toHaveTextContent("Blend total: 1.00 of 1.00");
  });

  it("Reset to defaults asks first; Cancel changes nothing, Confirm restores the defaults without saving", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderModal();
    fireEvent.change(numberInput(0), { target: { value: "0.6" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Nothing is saved until you press Save settings");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(numberInput(0).value).toBe("0.6");

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Reset to defaults" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(numberInput(0).value).toBe("0.4");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Esc closes only the reset confirmation, not the whole dialog", () => {
    const onClose = vi.fn();
    render(<ScoringSettingsModal assignmentId={7} currentConfig={CONFIG} sourceType="GITHUB" onClose={onClose} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
