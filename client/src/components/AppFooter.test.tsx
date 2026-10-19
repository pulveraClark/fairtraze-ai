import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "../router";
import { AppFooter, FOOTER_NOTE } from "./AppFooter";

describe("AppFooter", () => {
  it("shows the one 'not a grade' note and a Help link, even outside a router", () => {
    render(<AppFooter />);
    expect(screen.getByText(FOOTER_NOTE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How FairTraze works" })).toHaveAttribute("href", "/help");
  });

  it("lets a page replace the note and hides itself when printing on request", () => {
    const { container } = render(<AppFooter printHidden>Notifications are informational.</AppFooter>);
    expect(screen.getByText("Notifications are informational.")).toBeInTheDocument();
    expect(container.querySelector("footer")).toHaveClass("print:hidden");
  });

  it("opens Help inside the app when a router exists", async () => {
    const user = userEvent.setup();
    render(<RouterProvider><AppFooter /></RouterProvider>);
    await user.click(screen.getByRole("link", { name: "How FairTraze works" }));
    expect(window.location.pathname).toBe("/help");
  });
});
