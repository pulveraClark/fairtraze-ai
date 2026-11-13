import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { ProjectScoringConfig } from "@shared/types";
import { ScoringSettingsModal } from "./ScoringSettingsModal";

vi.mock("./Toast", () => ({ useToast: () => ({ showSuccessToast: vi.fn() }) }));

const CONFIG: ProjectScoringConfig = {
  weights: { commits: 0.4, lines: 0.4, activeDays: 0.2 },
  thresholds: { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 },
  blend: { wGitHub: 0.55, wDocs: 0.45 },
  docsWeights: { retainedText: 0.37, sessions: 0.30, activeDays: 0.33 },
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
    expect(screen.getByRole("status")).toHaveTextContent("Code total: 1.00 of 1.00");
    expect(screen.queryByRole("button", { name: "Balance" })).toBeNull();

    fireEvent.change(numberInput(2), { target: { value: "0.1" } });
    expect(screen.getByRole("status")).toHaveTextContent("Code total: 0.90 of 1.00");
    expect(screen.getByRole("status")).toHaveTextContent("Code weights add up to 0.90. They must add up to 1.00 (0.10 short)");
    expect((screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Balance" }));
    expect(screen.getByRole("status")).toHaveTextContent("Code total: 1.00 of 1.00");
    expect((screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(false);
    expect(numberInput(0).value).toBe("0.45");
  });

  it("an over total says so, and the blend has its own Balance", () => {
    renderModal("COMBINED");
    fireEvent.change(numberInput(6), { target: { value: "0.8" } });
    const blend = screen.getAllByRole("status").find((n) => /Blend total/.test(n.textContent ?? ""))!;
    expect(blend).toHaveTextContent("Blend total: 1.25 of 1.00");
    expect(blend).toHaveTextContent("(0.25 over)");
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

describe("ScoringSettingsModal Docs weights", () => {
  const renderIt = (sourceType: string, onSaved = vi.fn()) =>
    render(<ScoringSettingsModal assignmentId={7} currentConfig={CONFIG} sourceType={sourceType} onClose={() => {}} onSaved={onSaved} />);
  const num = (name: string) => screen.getByRole("spinbutton", { name }) as HTMLInputElement;
  const save = () => screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement;

  it("shows the sections that fit the source type", () => {
    const a = renderIt("GITHUB");
    expect(screen.getByText("Code weights (GitHub)")).toBeTruthy();
    expect(screen.queryByText("Writing weights (Docs)")).toBeNull();
    expect(screen.queryByText("Source blend")).toBeNull();
    a.unmount();

    const b = renderIt("EDITOR");
    expect(screen.queryByText("Code weights (GitHub)")).toBeNull();
    expect(screen.getByText("Writing weights (Docs)")).toBeTruthy();
    expect(screen.queryByText("Source blend")).toBeNull();
    expect(screen.getByText("Flag thresholds")).toBeTruthy();
    b.unmount();

    renderIt("COMBINED");
    const heads = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
    const at = (t: string) => heads.findIndex((h) => h.startsWith(t));
    expect(at("Code")).toBeGreaterThanOrEqual(0);
    expect(at("Code")).toBeLessThan(at("Writing"));
    expect(at("Writing")).toBeLessThan(at("Source"));
    expect(at("Source")).toBeLessThan(at("Flag"));
  });

  it("pre-fills the defaults, labels them, and says where they come from", () => {
    renderIt("COMBINED");
    expect(num("Retained text weight").value).toBe("0.37");
    expect(num("Writing sessions weight").value).toBe("0.3");
    expect(num("Writing active days weight").value).toBe("0.33");
    expect(screen.getByText("Default 0.37")).toBeTruthy();
    expect(screen.getByText("Default weights come from an expert survey of instructors (AHP).")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/16 instructors/);
  });

  it("explains each Docs weight in one plain sentence", () => {
    renderIt("EDITOR");
    fireEvent.click(screen.getByRole("button", { name: "About retained text" }));
    expect(screen.getByRole("group", { name: "About retained text" })).toHaveTextContent("How much of the member's writing is still in the final document.");
    fireEvent.click(screen.getByRole("button", { name: "About writing active days" }));
    expect(screen.getByRole("group", { name: "About writing active days" })).toHaveTextContent("On how many days the member kept at least 30 characters.");
  });

  it("the Docs total updates live, names what to fix, turns Save off, and Balance fixes it", () => {
    renderIt("EDITOR");
    expect(screen.getByRole("status")).toHaveTextContent("Docs total: 1.00 of 1.00");
    expect(screen.getByRole("status").textContent).toContain("✓");
    fireEvent.change(num("Writing sessions weight"), { target: { value: "0.25" } });
    expect(screen.getByRole("status").textContent).toContain("✕");
    expect(screen.getByRole("status")).toHaveTextContent("Docs total: 0.95 of 1.00");
    expect(screen.getByRole("status")).toHaveTextContent("Docs weights add up to 0.95. They must add up to 1.00");
    expect(save().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Balance" }));
    expect(screen.getByRole("status")).toHaveTextContent("Docs total: 1.00 of 1.00");
    expect(save().disabled).toBe(false);
  });

  it("marks a changed weight and resets just that group without saving", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderIt("COMBINED");
    expect(screen.queryByRole("button", { name: "Reset docs weights to default" })).toBeNull();
    fireEvent.change(num("Retained text weight"), { target: { value: "0.5" } });
    expect(screen.getByText("Changed · default 0.37")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset docs weights to default" }));
    expect(num("Retained text weight").value).toBe("0.37");
    expect(num("Commits weight").value).toBe("0.4"); // the code group is untouched
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a Docs total that is off blocks Save in a Combined project even when code and blend are fine", () => {
    renderIt("COMBINED");
    fireEvent.change(num("Retained text weight"), { target: { value: "0.5" } });
    expect(save().disabled).toBe(true);
  });

  it("sends the Docs weights with the save", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ config: CONFIG }) });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    renderIt("EDITOR", onSaved);
    fireEvent.change(num("Retained text weight"), { target: { value: "0.4" } });
    fireEvent.change(num("Writing active days weight"), { target: { value: "0.3" } });
    fireEvent.click(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.docsWeights).toEqual({ retainedText: 0.4, sessions: 0.3, activeDays: 0.3 });
  });

  it("every weight has a number box and a slider with an accessible name", () => {
    renderIt("COMBINED");
    for (const n of ["Commits", "Lines added", "Code active days", "Retained text", "Writing sessions", "Writing active days"]) {
      expect(screen.getByRole("spinbutton", { name: `${n} weight` })).toBeTruthy();
      expect(screen.getByRole("slider", { name: `${n} weight slider` })).toBeTruthy();
    }
  });

  it("Reset to defaults restores the Docs weights too", () => {
    renderIt("EDITOR");
    fireEvent.change(num("Retained text weight"), { target: { value: "0.6" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Reset to defaults" }));
    expect(num("Retained text weight").value).toBe("0.37");
  });
});

describe("ScoringSettingsModal dialog semantics", () => {
  it("is a modal dialog; Esc closes it, but with the reset confirmation open Esc closes only that", async () => {
    const onClose = vi.fn();
    render(<ScoringSettingsModal assignmentId={7} currentConfig={CONFIG} sourceType="GITHUB" onClose={onClose} onSaved={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Scoring settings" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /reset to defaults/i }));
    expect(screen.getByText(/Every weight and threshold on this screen/)).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/Every weight and threshold on this screen/)).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Cancel and Save are at least 32px buttons from the shared styles", () => {
    render(<ScoringSettingsModal assignmentId={7} currentConfig={CONFIG} sourceType="GITHUB" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByRole("button", { name: "Cancel" }).className).toContain("min-h-8");
    expect(screen.getByRole("button", { name: "Save settings" }).className).toContain("min-h-8");
  });
});
