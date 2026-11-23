import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { useState } from "react";
import { InstructorInstructionsModal } from "./InstructorInstructionsModal";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));

const BRIEF = "Build a login page. Students write a survey report.";
const ok = (extra: object = {}) => ({
  ok: true,
  json: async () => ({ assignment: { title: "Capstone", description: BRIEF, attachments: [], ...extra } }),
});

function Host({ quote }: { quote?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>See in the instructions</button>
      {open && <InstructorInstructionsModal assignmentId={7} quote={quote} editHref="/class/1/assignment/7" onClose={() => setOpen(false)} />}
    </>
  );
}

describe("InstructorInstructionsModal", () => {
  beforeEach(() => {
    cleanup();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("fetches nothing until it opens, then loads the text from the existing assignment endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);
    render(<Host />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("See in the instructions"));
    expect(screen.getByRole("status").textContent).toContain("Loading the instructions");
    await waitFor(() => expect(screen.getByText(/Build a login page/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/assignments/7");
  });

  it("marks the quoted sentence and scrolls to it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok()));
    render(<Host quote="Students write a survey report." />);
    fireEvent.click(screen.getByText("See in the instructions"));
    const mark = await waitFor(() => {
      const m = document.querySelector("mark");
      expect(m).toBeTruthy();
      return m!;
    });
    expect(mark.textContent).toMatch(/^Students write a survey report.?$/);
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it("shows an error with Try again, and the second try works", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({}) }).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    render(<Host />);
    fireEvent.click(screen.getByText("See in the instructions"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText(/Build a login page/)).toBeTruthy());
  });

  it("offers Edit the instructions, closes with Esc and returns focus to the trigger", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok()));
    render(<Host />);
    const trigger = screen.getByText("See in the instructions");
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByText(/Build a login page/);
    expect(screen.getByRole("link", { name: "Edit the instructions" }).getAttribute("href")).toBe("/class/1/assignment/7");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("is a full-screen sheet on a phone and a centered window from 640px", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok()));
    render(<Host />);
    fireEvent.click(screen.getByText("See in the instructions"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("h-full");
    expect(dialog.className).toContain("sm:max-w-2xl");
    expect(dialog.className).toContain("sm:rounded-xl");
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("min-h-10");
  });
});
