import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "../router";
import { RegisterPage } from "./RegisterPage";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

const register = vi.fn();

function renderPage() {
  vi.mocked(AuthContextModule.useAuth).mockReturnValue({
    user: null, token: null, loading: false,
    register, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
  });
  return render(
    <RouterProvider>
      <RegisterPage />
    </RouterProvider>,
  );
}

async function fillForm() {
  await userEvent.type(screen.getByPlaceholderText("Dr. Jane Smith"), "Jane");
  await userEvent.type(screen.getByPlaceholderText("you@university.edu"), "jane@uclm.edu.ph");
  const [pw, confirm] = screen.getAllByPlaceholderText("••••••••");
  await userEvent.type(pw!, "password123");
  await userEvent.type(confirm!, "password123");
}

describe("RegisterPage privacy consent", () => {
  afterEach(() => vi.clearAllMocks());

  it("keeps Create account disabled until the Privacy Notice box is ticked", async () => {
    renderPage();
    await fillForm();
    const submit = screen.getByRole("button", { name: "Create account" });
    expect(submit).toBeDisabled();
    expect(register).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("checkbox", { name: /read and agree to the privacy notice/i }));
    expect(submit).toBeEnabled();
  });

  it("links to the public notice and sends the acceptance with the sign-up", async () => {
    register.mockResolvedValue({ emailVerificationRequired: false });
    renderPage();
    expect(screen.getByRole("link", { name: "Privacy Notice" })).toHaveAttribute("href", "/privacy");

    await fillForm();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(register).toHaveBeenCalledWith("jane@uclm.edu.ph", "password123", "Jane", "INSTRUCTOR", true));
  });
});
