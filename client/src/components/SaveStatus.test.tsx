import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SaveStatus } from "./SaveStatus";

describe("SaveStatus", () => {
  it("is a polite live region and shows the plain text for each state", () => {
    const { rerender } = render(<SaveStatus state="saving" />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("Saving…");
    rerender(<SaveStatus state="saved" />);
    expect(screen.getByRole("status")).toHaveTextContent("All changes saved");
    rerender(<SaveStatus state="offline" />);
    expect(screen.getByRole("status")).toHaveTextContent("Offline. Changes will sync when you reconnect.");
  });
  it("keeps the live region but shows nothing without a state", () => {
    render(<SaveStatus state={null} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
