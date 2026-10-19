import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
