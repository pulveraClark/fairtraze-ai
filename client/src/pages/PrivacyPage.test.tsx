import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PRIVACY_NOTICE_UPDATED, PRIVACY_NOTICE_VERSION } from "@shared/privacyNotice";
import { RouterProvider } from "../router";
import { PrivacyPage } from "./PrivacyPage";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

describe("PrivacyPage", () => {
  it("renders for a signed-out visitor with version, date, Gemini detail and the NPC route", () => {
    vi.mocked(AuthContextModule.useAuth).mockReturnValue({
      user: null, token: null, loading: false,
      register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
    });
    render(<RouterProvider><PrivacyPage /></RouterProvider>);

    expect(screen.getByRole("heading", { level: 1, name: "Privacy Notice" })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Version ${PRIVACY_NOTICE_VERSION} · Last updated ${PRIVACY_NOTICE_UPDATED}`))).toBeInTheDocument();
    for (const h of ["Who we are", "Who can see what", "How deletion works", "Your rights under RA 10173"]) {
      expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    }
    expect(screen.getByText(/Google Gemini/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "privacy.gov.ph" })).toHaveAttribute("href", "https://privacy.gov.ph");
  });
});
