import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouterProvider } from "../router";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

function signedOut() {
  vi.mocked(AuthContextModule.useAuth).mockReturnValue({
    user: null, token: null, loading: false,
    register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
  });
}

describe("form labels are tied to their inputs (I11)", () => {
  it("login: a screen reader gets a name for every field", () => {
    signedOut();
    render(<RouterProvider><LoginPage /></RouterProvider>);
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("register: every field has an accessible name", () => {
    signedOut();
    render(<RouterProvider><RegisterPage /></RouterProvider>);
    expect(screen.getByRole("textbox", { name: "Full name" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Institutional email" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Role" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("id", "register-password");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("checkbox", { name: /I have read and agree/ })).toBeInTheDocument();
  });
});
