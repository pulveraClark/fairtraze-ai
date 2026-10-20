import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_WEIGHTS, OVERLOAD_THRESHOLD, HEALTHY_GINI_THRESHOLD } from "@shared/scoring";
import { COMMIT_IMPACT } from "@shared/commitClassifier";
import { DOCUMENT_DEFAULT_WEIGHTS, MIN_ACTIVE_DAY_RETAINED_CHARS } from "@shared/documentScoring";
import { LINE_TYPE_WEIGHTS } from "@shared/lineClassifier";
import { RouterProvider } from "../router";
import { HelpPage } from "./HelpPage";
import { HELP_ANCHORS } from "../lib/helpText";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

function renderAs(role: "STUDENT" | "INSTRUCTOR" | null) {
  vi.mocked(AuthContextModule.useAuth).mockReturnValue({
    user: role ? ({ id: 1, name: "A", systemRole: role } as never) : null,
    token: null, loading: false,
    register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
  });
  return render(<RouterProvider><HelpPage /></RouterProvider>);
}

describe("HelpPage", () => {
  it("opens on the student view for students and logged-out visitors, the instructor view for instructors", () => {
    const a = renderAs("STUDENT");
    expect(screen.getByRole("button", { name: "For students" })).toHaveAttribute("aria-pressed", "true");
    a.unmount();
    const b = renderAs(null);
    expect(screen.getByRole("button", { name: "For students" })).toHaveAttribute("aria-pressed", "true");
    b.unmount();
    renderAs("INSTRUCTOR");
    expect(screen.getByRole("button", { name: "For instructors" })).toHaveAttribute("aria-pressed", "true");
  });

  it("signed in: drops its own Back button and uses the shared footer without a self-link", () => {
    renderAs("STUDENT");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByRole("contentinfo")).toHaveTextContent(/do not constitute grades/);
    expect(screen.queryByRole("link", { name: "How FairTraze works" })).toBeNull();
  });

  it("logged out: keeps the standalone page with a Back button", () => {
    renderAs(null);
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("scrolls to #section on load and when the hash changes", () => {
    const scroll = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scroll;
    window.location.hash = "#faq";
    renderAs("STUDENT");
    expect(scroll).toHaveBeenCalledTimes(1);
    window.location.hash = "#flags";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(scroll.mock.calls.length).toBeGreaterThanOrEqual(2);
    window.location.hash = "";
  });

  it("has an element for every anchor the app links to, in both views", async () => {
    const user = userEvent.setup();
    renderAs("STUDENT");
    for (const view of ["For students", "For instructors"]) {
      await user.click(screen.getByRole("button", { name: view }));
      for (const id of HELP_ANCHORS) expect(document.getElementById(id), `#${id} in ${view}`).not.toBeNull();
    }
  });

  it("reads the numbers from the scoring constants", async () => {
    const user = userEvent.setup();
    renderAs("INSTRUCTOR");
    expect(screen.getByText(new RegExp(`above ${OVERLOAD_THRESHOLD}× the equal share`))).toBeInTheDocument();
    expect(document.getElementById("gini")?.textContent).toMatch(new RegExp(`Healthy below ${HEALTHY_GINI_THRESHOLD}`));
    await user.click(screen.getByText("Show the exact numbers"));
    const exact = screen.getByText("Show the exact numbers").closest("details")!;
    expect(within(exact).getByText(new RegExp(`commits ${DEFAULT_WEIGHTS.commits}, lines ${DEFAULT_WEIGHTS.lines}`))).toBeInTheDocument();
    expect(within(exact).getByText(new RegExp(`structural ${COMMIT_IMPACT.structural.toFixed(1)}×`))).toBeInTheDocument();
  });

  it("describes the version-2 rules from the constants: Docs weights, line types, 30-character day, Philippine time", async () => {
    const user = userEvent.setup();
    renderAs("INSTRUCTOR");
    expect(DOCUMENT_DEFAULT_WEIGHTS).toEqual({ retainedText: 0.6, sessions: 0.2, activeDays: 0.2 });
    await user.click(screen.getByText("Show the exact numbers"));
    const exact = screen.getByText("Show the exact numbers").closest("details")!;
    expect(within(exact).getByText(/kept text 0\.6, sessions 0\.2, active days 0\.2/)).toBeInTheDocument();
    expect(within(exact).getByText(new RegExp(`code ${LINE_TYPE_WEIGHTS.code}, comment ${LINE_TYPE_WEIGHTS.comment}, blank ${LINE_TYPE_WEIGHTS.blank}`))).toBeInTheDocument();
    expect(document.body.textContent).toContain(`at least ${MIN_ACTIVE_DAY_RETAINED_CHARS} characters`);
    expect(document.body.textContent).toContain("in Philippine time");
    expect(document.body.textContent).not.toMatch(/Comment and blank lines are not discounted/);
  });

  it("uses student wording and never shows the Gini value or threshold list to students", () => {
    renderAs("STUDENT");
    expect(screen.getByText("Low contribution")).toBeInTheDocument();
    expect(screen.getByText("Work is evenly shared")).toBeInTheDocument();
    expect(screen.queryByText(/Gini/)).toBeNull();
    expect(screen.queryByText("Show the exact numbers")).toBeNull();
  });

  it("states what the AI does not do, and that tasks never change a score", () => {
    renderAs("STUDENT");
    expect(screen.getByText(/The AI never grades/)).toBeInTheDocument();
    expect(screen.getByText(/never change any share, flag or health label/)).toBeInTheDocument();
  });

  describe("search", () => {
    const visibleSections = () => [...document.querySelectorAll<HTMLElement>("[data-help-section]")].filter((e) => !e.hidden).map((e) => e.dataset.helpSection);

    it("has an accessible label and filters sections and questions as you type", async () => {
      const user = userEvent.setup();
      renderAs("STUDENT");
      const box = screen.getByRole("searchbox", { name: "Search help" });
      expect(box).toHaveAttribute("placeholder", "Search help…");
      await user.type(box, "offline");
      expect(visibleSections()).toContain("faq");
      expect(visibleSections().length).toBeLessThan(HELP_ANCHORS.length);
      expect(screen.getByText(/My share looks small/)).toBeInTheDocument();
      expect(screen.queryByText("Do tasks count toward my score?")).toBeNull();
    });

    it("is case-insensitive and treats 'free rider' like 'free-rider'", async () => {
      const user = userEvent.setup();
      renderAs("INSTRUCTOR");
      const box = screen.getByRole("searchbox", { name: "Search help" });
      await user.type(box, "FREE RIDER");
      expect(visibleSections()).toContain("flags");
    });

    it("shows the empty message, keeps the toggle, and Esc clears", async () => {
      const user = userEvent.setup();
      renderAs("STUDENT");
      const box = screen.getByRole("searchbox", { name: "Search help" });
      await user.type(box, "zzzzqq");
      expect(screen.getByRole("status")).toHaveTextContent("No results. Try 'flags' or 'tasks'.");
      expect(visibleSections()).toEqual([]);
      expect(screen.getByRole("button", { name: "For instructors" })).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(box).toHaveValue("");
      expect(visibleSections().length).toBe(document.querySelectorAll("[data-help-section]").length);
    });

    it("student searches for staff wording find the student wording", async () => {
      const user = userEvent.setup();
      renderAs("STUDENT");
      const box = screen.getByRole("searchbox", { name: "Search help" });
      for (const term of ["free-rider", "inactive", "gini", "inequality"]) {
        await user.clear(box);
        await user.type(box, term);
        expect(visibleSections(), term).toContain("flags");
      }
      expect(screen.queryByText(/Gini/)).toBeNull();
    });

    it("finds the new questions and never shows Gini to students", async () => {
      const user = userEvent.setup();
      renderAs("STUDENT");
      const box = screen.getByRole("searchbox", { name: "Search help" });
      await user.type(box, "images");
      expect(screen.getByText("Do images count?")).toBeInTheDocument();
      expect(screen.queryByText(/Gini/)).toBeNull();
      await user.clear(box);
      await user.type(box, "link github");
      expect(screen.getByText("How do I link GitHub?")).toBeInTheDocument();
    });
  });
});
