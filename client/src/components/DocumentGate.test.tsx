import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CHANGE_TEMPLATE_HINT, HISTORY_HINT } from "../lib/docActionHints";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t" }) }));
vi.mock("./DocumentEditor", () => ({ DocumentEditor: () => <div>editor</div> }));

import { DocumentGate } from "./DocumentGate";

afterEach(() => vi.unstubAllGlobals());

describe("DocumentGate Change template (I31)", () => {
  it("is a real button whose tooltip says what it does and when it works", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ exists: true, resettable: true }) })));
    render(<DocumentGate groupId={1} editable canChooseTemplate />);
    const button = await screen.findByRole("button", { name: "Change template" });
    expect(button).toHaveClass("border", "min-h-8");
    expect(button).toHaveAttribute("title", CHANGE_TEMPLATE_HINT);
    expect(CHANGE_TEMPLATE_HINT).toMatch(/until someone types, imports text or adds a comment/);
  });

  it("History's tooltip matches what the history panel really shows", () => {
    expect(HISTORY_HINT).toMatch(/earlier versions/);
    expect(HISTORY_HINT).toMatch(/each time the group's report is analyzed/);
  });
});

describe("DocumentGate Change template confirmation", () => {
  it("asks in a ConfirmDialog (never window.confirm); Cancel changes nothing, Confirm resets", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => (init?.method === "POST" ? { exists: false } : { exists: true, resettable: true }),
    }));
    vi.stubGlobal("fetch", fetchFn);
    render(<DocumentGate groupId={1} editable canChooseTemplate />);
    await userEvent.click(await screen.findByRole("button", { name: "Change template" }));
    expect(screen.getByRole("alertdialog", { name: "Change the starting template?" })).toBeInTheDocument();
    const callsBefore = fetchFn.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(fetchFn.mock.calls.length).toBe(callsBefore);

    await userEvent.click(screen.getByRole("button", { name: "Change template" }));
    const dialog = screen.getByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Change template" }));
    await waitFor(() => expect(fetchFn.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
