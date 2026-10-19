import { describe, it, expect, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { RouterProvider } from "../router";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: null, token: null, loading: false, register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() }),
}));

function stubWidth(wide: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: wide && q.includes("1024px"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
}

describe.each([["Login", LoginPage], ["Register", RegisterPage]] as const)("%s sample artwork (R12)", (_name, Page) => {
  afterEach(() => vi.unstubAllGlobals());

  it("is not rendered below lg", () => {
    stubWidth(false);
    const { container } = render(<RouterProvider><Page /></RouterProvider>);
    expect(container.querySelector("svg[viewBox='0 0 320 220']")).toBeNull();
    expect(container.textContent).not.toMatch(/FREE RIDER|CONTRIBUTION SHARE/);
  });

  it("is rendered from lg up", () => {
    stubWidth(true);
    const { container } = render(<RouterProvider><Page /></RouterProvider>);
    expect(container.querySelector("svg[viewBox='0 0 320 220']")).not.toBeNull();
  });

  it("does not label FairTraze Docs as coming soon (it is live) (I9)", () => {
    stubWidth(true);
    const { container } = render(<RouterProvider><Page /></RouterProvider>);
    expect(container.textContent).not.toMatch(/soon/i);
  });
});
