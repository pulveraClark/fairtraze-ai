import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerifyReportBox } from "./VerifyReportBox";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 1, name: "Ins", systemRole: "INSTRUCTOR" } }),
}));

const members = [
  { name: "Ana Cruz", githubPct: 60, docsPct: 40, combinedPct: 50, flags: [] },
  { name: "Ben Reyes", githubPct: 40, docsPct: 60, combinedPct: 50, flags: ["overload"] },
];
const base = {
  groupName: "Group 1", projectTitle: "Capstone", analyzedAt: "2026-11-10T02:00:00.000Z",
  sourceType: "COMBINED", weights: { githubPct: 50, docsPct: 50 }, members,
};

function mockFetch(status: number, body: unknown) {
  const f = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  vi.stubGlobal("fetch", f);
  return f;
}

describe("VerifyReportBox", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("shows 'Matches the latest analysis' with the printout's numbers and no Gini or bands", async () => {
    const f = mockFetch(200, { ...base, status: "latest" });
    render(<VerifyReportBox />);
    await userEvent.type(screen.getByLabelText(/Report ID/), "ft-7k2p-9x");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(screen.getByText(/Matches the latest analysis/)).toBeTruthy());
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ code: "ft-7k2p-9x" });
    expect(screen.getByText("Ana Cruz")).toBeTruthy();
    expect(screen.getByText("overload")).toBeTruthy();
    expect(screen.getByText(/Group 1 · Capstone · Analyzed/)).toBeTruthy();
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const w of ["gini", "healthy", "high risk", "moderate risk"]) expect(text).not.toContain(w);
  });

  it("shows 'Older report. A newer analysis exists.' for an older analysis", async () => {
    mockFetch(200, { ...base, status: "older" });
    render(<VerifyReportBox />);
    await userEvent.type(screen.getByLabelText(/Report ID/), "FT-7K2P-9X");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(screen.getByText(/Older report\. A newer analysis exists\./)).toBeTruthy());
  });

  it("says 'Report ID not found.' for a wrong code", async () => {
    mockFetch(404, { error: "Report ID not found." });
    render(<VerifyReportBox />);
    await userEvent.type(screen.getByLabelText(/Report ID/), "FT-AAAA-AA");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(screen.getByText("Report ID not found.")).toBeTruthy());
  });

  it("keeps Verify disabled until something is typed", () => {
    render(<VerifyReportBox />);
    expect((screen.getByRole("button", { name: "Verify" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
