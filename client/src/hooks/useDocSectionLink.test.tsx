import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../components/Toast";
import {
  DocSectionLink, DocSectionProvider, SECTION_MISSING_MESSAGE, docSectionHref, sectionFromSearch, useDocSectionNav,
} from "./useDocSectionLink";

const wrapper = ({ children }: { children: React.ReactNode }) => <ToastProvider>{children}</ToastProvider>;

afterEach(() => { window.history.replaceState(null, "", "/"); });

describe("Docs section links", () => {
  it("builds ?tab=document&section=<heading> and drops a task id", () => {
    expect(docSectionHref("Methods & Tools", "http://x.test/student/group/7?tab=tasks&task=4")).toBe("/student/group/7?tab=document&section=Methods+%26+Tools");
    expect(sectionFromSearch("?tab=document&section=Methods+%26+Tools")).toBe("Methods & Tools");
    expect(sectionFromSearch("?tab=report&section=Intro")).toBeNull();
    expect(sectionFromSearch("?tab=document")).toBeNull();
  });

  it("opens the section in the same tab (no target), keeps modified clicks native, and is plain text with no page behind it", async () => {
    const open = vi.fn();
    render(<DocSectionProvider value={open}><DocSectionLink heading="Introduction" /></DocSectionProvider>);
    const a = screen.getByRole("link", { name: "Open section Introduction in Docs" });
    expect(a.getAttribute("target")).toBeNull();
    expect(a.getAttribute("href")).toContain("tab=document&section=Introduction");
    expect(a.className).toContain("min-h-10");
    await userEvent.click(a);
    expect(open).toHaveBeenCalledWith("Introduction");
    fireEvent.click(a, { ctrlKey: true });
    fireEvent.click(a, { button: 1 });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("renders only the heading text outside a page that has a Docs tab", () => {
    render(<DocSectionLink heading="Introduction" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Introduction")).toBeTruthy();
  });
});

describe("useDocSectionNav", () => {
  it("pushes a history entry, switches to Docs, and Back goes to the report", () => {
    const showDocument = vi.fn();
    const syncFromLocation = vi.fn();
    window.history.replaceState(null, "", "/student/group/7?tab=report");
    const before = window.history.length;
    const { result } = renderHook(() => useDocSectionNav(showDocument, syncFromLocation), { wrapper });

    act(() => result.current.open("Introduction"));
    expect(window.history.length).toBe(before + 1);
    expect(window.location.search).toBe("?tab=document&section=Introduction");
    expect(result.current.heading).toBe("Introduction");
    expect(showDocument).toHaveBeenCalled();

    window.history.replaceState(null, "", "/student/group/7?tab=report");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(syncFromLocation).toHaveBeenCalled();
    expect(result.current.heading).toBeNull();
  });

  it("found: clears the target without a toast; missing: says the section may have been renamed and stays at the top", () => {
    const { result } = renderHook(() => useDocSectionNav(vi.fn(), vi.fn()), { wrapper });
    act(() => result.current.open("Gone"));
    act(() => result.current.onResolved(true));
    expect(screen.queryByText(SECTION_MISSING_MESSAGE)).toBeNull();

    act(() => result.current.open("Gone"));
    act(() => result.current.onResolved(false));
    expect(result.current.heading).toBeNull();
    expect(screen.getByText(SECTION_MISSING_MESSAGE)).toBeTruthy();
  });

  it("starts at the section named in a Docs link", () => {
    window.history.replaceState(null, "", "/g?tab=document&section=Results");
    const { result } = renderHook(() => useDocSectionNav(vi.fn(), vi.fn()), { wrapper });
    expect(result.current.heading).toBe("Results");
  });
});
