import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { RouterProvider } from "../router";
import { LandingPage } from "./LandingPage";

const auth = vi.hoisted(() => ({
  value: { user: null as null | { id: number; name: string; email: string; systemRole: string }, token: null as string | null, loading: false },
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ ...auth.value, register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() }),
  useAuthOptional: () => ({ ...auth.value }),
}));

function renderLanding() {
  return render(<RouterProvider><LandingPage /></RouterProvider>);
}

beforeEach(() => {
  auth.value = { user: null, token: null, loading: false };
  // A fresh page load at "/" that came from outside the app (no in-app navigation yet).
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("IntersectionObserver", class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("LandingPage", () => {
  it("AUTH-01: loads with the product name and the sample report showing the Low contribution pill", () => {
    const { container } = renderLanding();
    expect(screen.getAllByAltText("FAIR TRAZE AI").length).toBeGreaterThan(0);
    expect(screen.getByText("Contribution Share")).toBeInTheDocument();
    // The sample card's flag reads the one flag name (shown in capitals by CSS), never the old words.
    expect(screen.getAllByText("Low contribution").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/free[- ]?rider/i);
  });

  it("AUTH-03: the Sign in button in the top bar opens the sign-in page", () => {
    renderLanding();
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: /^sign in$/i }));
    expect(window.location.pathname).toBe("/login");
  });

  it("AUTH-04: the Get Started button opens the Create Account page", () => {
    renderLanding();
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Get Started" }));
    expect(window.location.pathname).toBe("/register");
  });

  it("AUTH-14: a signed-in student sees Go to Dashboard instead of Sign in, and it opens their dashboard", () => {
    auth.value = { user: { id: 4, name: "Ana", email: "a@x.test", systemRole: "STUDENT" }, token: "t", loading: false };
    // An in-app visit (logo click or Back), so the page does not auto-redirect and the button can be seen.
    window.history.replaceState({ intentional: true }, "", "/");
    renderLanding();
    expect(screen.queryByRole("button", { name: /^sign in$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Get Started" })).toBeNull();
    const buttons = screen.getAllByRole("button", { name: /Go to Dashboard/ });
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]);
    expect(window.location.pathname).toBe("/student");
  });
});
