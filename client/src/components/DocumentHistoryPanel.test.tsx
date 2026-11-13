import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HISTORY_HINT, HISTORY_NOTE } from "../lib/docActionHints";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t" }) }));

import { DocumentHistoryPanel } from "./DocumentHistoryPanel";

afterEach(() => vi.unstubAllGlobals());

const LIST = { snapshots: [{ id: 2, createdAt: "2026-11-10T17:00:00.000Z", reportId: 5 }, { id: 1, createdAt: "2026-11-09T02:00:00.000Z", reportId: 4 }] };
const VERSION = {
  id: 2, createdAt: "2026-11-10T17:00:00.000Z", reportId: 5,
  blocks: [
    { kind: "paragraph", runs: [{ text: "Hello " }, { text: "[image]", italic: true }] },
    { kind: "table", rows: [{ cells: [{ header: false, blocks: [{ kind: "paragraph", runs: [{ text: "cell" }] }] }] }] },
  ],
};

function stubFetch(handlers: Record<string, () => unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const key = Object.keys(handlers).find((k) => url.endsWith(k));
    const body = key ? handlers[key]() : null;
    if (body instanceof Error) throw body;
    const bad = body && typeof body === "object" && "__status" in (body as object);
    return { ok: !bad, status: bad ? 500 : 200, json: async () => body };
  }));
}

describe("DocumentHistoryPanel", () => {
  it("announces loading, lists versions on the Manila clock with accessible names, and shows the one-line note", async () => {
    stubFetch({ "/snapshots": () => LIST });
    render(<DocumentHistoryPanel groupId={1} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading history…");
    // 17:00 UTC on Nov 10 is 1:00 AM on Nov 11 in Manila, whatever the browser's own zone is.
    const row = await screen.findByRole("button", { name: /Open the version saved Nov 11, 2026, 1:00 AM/ });
    expect(row.className).toMatch(/min-h-10/);
    expect(screen.getByText(HISTORY_NOTE)).toBeInTheDocument();
    expect(HISTORY_NOTE).toMatch(/one saved version per analysis/);
    expect(HISTORY_NOTE).toMatch(/Images are not shown in old versions/);
    expect(HISTORY_HINT).toMatch(/document has changed/);
  });

  it("a list error is an alert with the word Problem and a Retry that loads again", async () => {
    let fail = true;
    stubFetch({ "/snapshots": () => (fail ? { __status: 500 } : LIST) });
    render(<DocumentHistoryPanel groupId={1} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Problem: Could not load document history.");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findAllByRole("button", { name: /Open the version saved/ })).toHaveLength(2);
  });

  it("opening a version moves focus to its heading, shows [image] and a scrollable table, and Back returns focus to the row", async () => {
    stubFetch({ "/snapshots": () => LIST, "/snapshots/2": () => VERSION });
    render(<DocumentHistoryPanel groupId={1} />);
    const row = await screen.findByRole("button", { name: /Nov 11, 2026/ });
    await userEvent.click(row);
    const heading = await screen.findByRole("heading", { name: /Version saved Nov 11, 2026, 1:00 AM \(Manila time\), read-only/ });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText("[image]")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Table/ }).className).toMatch(/overflow-x-auto/);
    const back = screen.getByRole("button", { name: /Back to history list/ });
    expect(back.className).toMatch(/min-h-9/);
    await userEvent.click(back);
    await waitFor(() => expect(screen.getByRole("button", { name: /Nov 11, 2026/ })).toHaveFocus());
  });

  it("the clicked row shows 'Opening…' while the version loads", async () => {
    let finish!: (v: unknown) => void;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.endsWith("/snapshots")) return Promise.resolve({ ok: true, status: 200, json: async () => LIST });
      return new Promise((resolve) => { finish = resolve; });
    }));
    render(<DocumentHistoryPanel groupId={1} />);
    const row = await screen.findByRole("button", { name: /Nov 11, 2026/ });
    await userEvent.click(row);
    expect(await screen.findByText("Opening…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nov 11, 2026/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("View →", { selector: "span" })).not.toBeNull(); // the other row keeps its normal label
    finish({ ok: true, status: 200, json: async () => VERSION });
    await screen.findByRole("heading", { name: /Version saved/ });
  });

  it("after Retry, focus moves to the loading line and then to the first row (not the top of the page)", async () => {
    let fail = true;
    stubFetch({ "/snapshots": () => (fail ? { __status: 500 } : LIST) });
    render(<DocumentHistoryPanel groupId={1} />);
    await screen.findByRole("alert");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    const first = await screen.findAllByRole("button", { name: /Open the version saved/ });
    await waitFor(() => expect(first[0]).toHaveFocus());
  });

  it("after a failed Retry the new Retry button has focus", async () => {
    stubFetch({ "/snapshots": () => ({ __status: 500 }) });
    render(<DocumentHistoryPanel groupId={1} />);
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus());
  });

  it("a version error is an alert and the list stays usable", async () => {
    stubFetch({ "/snapshots": () => LIST, "/snapshots/2": () => ({ __status: 500, error: "x" }) });
    render(<DocumentHistoryPanel groupId={1} />);
    await userEvent.click(await screen.findByRole("button", { name: /Nov 11, 2026/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Problem: /);
    expect(screen.getByRole("button", { name: /Nov 11, 2026/ })).toBeEnabled();
  });

  it("empty history says how a version is saved", async () => {
    stubFetch({ "/snapshots": () => ({ snapshots: [] }) });
    render(<DocumentHistoryPanel groupId={1} />);
    expect(await screen.findByText(/No history yet/)).toBeInTheDocument();
  });
});
