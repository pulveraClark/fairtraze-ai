import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { AiReviewSwitch } from "./AiReviewSwitch";

afterEach(() => { vi.unstubAllGlobals(); });

function Harness({ initial = true }: { initial?: boolean }) {
  const [on, setOn] = useState(initial);
  return <AiReviewSwitch classId={3} enabled={on} token="t" onChanged={setOn} />;
}

describe("AiReviewSwitch", () => {
  it("states On or Off in words, and saves at once without a confirm step", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    const sw = screen.getByRole("switch", { name: "AI findings: On" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    await userEvent.click(sw);
    expect(screen.getByRole("switch", { name: "AI findings: Off" }).getAttribute("aria-checked")).toBe("false");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/classes/3/ai-review");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ enabled: false });
  });

  it("goes back to the old state and says so when the server refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<Harness />);
    await userEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/It was not changed/));
    expect(screen.getByRole("switch", { name: "AI findings: On" })).toBeTruthy();
  });
});
