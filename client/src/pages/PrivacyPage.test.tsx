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
    // AI findings: what is sent, the free-tier statement, and who sees the findings.
    expect(screen.getByText(/free Gemini API tier/)).toBeInTheDocument();
    expect(screen.getByText(/may use what it receives to improve its products/)).toBeInTheDocument();
    expect(screen.getByText(/the AI findings for every member and the project instructions check for their group/)).toBeInTheDocument();
    expect(screen.getByText(/Google processes this data outside the Philippines/)).toBeInTheDocument();
  });

  it("version 1.4 says what the project instructions check sends, that files are not cleaned, and how long they are kept", () => {
    vi.mocked(AuthContextModule.useAuth).mockReturnValue({
      user: null, token: null, loading: false,
      register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
    });
    render(<RouterProvider><PrivacyPage /></RouterProvider>);
    expect(PRIVACY_NOTICE_VERSION).toBe("1.4");
    // What is sent: the written instructions (the explanation gets the first 1,500 characters) and the files.
    expect(screen.getByText(/the first 1,500 characters of the written project instructions/)).toBeInTheDocument();
    expect(screen.getByText(/the files attached to them \(one PDF and up to three images, PNG, JPEG or WebP\)/)).toBeInTheDocument();
    expect(screen.getByText(/images were resized and re-encoded by the browser/i)).toBeInTheDocument();
    // Files are not cleaned.
    expect(screen.getByText(/it cannot be done inside attached files, so names, emails or keys inside a file are sent as they are/)).toBeInTheDocument();
    // Kept as part of the project, and who can open them.
    expect(screen.getByText(/until your instructor removes them or deletes the project\. Students in the class can open them/)).toBeInTheDocument();
    // Who sees the "The AI read:" information.
    expect(screen.getByText(/including which attached files the AI read and which it skipped/)).toBeInTheDocument();
    expect(screen.getByText(/it also says which attached files the AI read or skipped/)).toBeInTheDocument();
    // The old terms are gone from the notice.
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/AI work summar|brief comparison|project brief|assignment brief/i);
    expect(screen.getByRole("link", { name: "privacy.gov.ph" })).toHaveAttribute("href", "https://privacy.gov.ph");
  });

  it("says leaders and instructors can attach a short note and a screenshot to an instructions item, who sees it, and that it is deleted with the group", () => {
    vi.mocked(AuthContextModule.useAuth).mockReturnValue({
      user: null, token: null, loading: false,
      register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
    });
    render(<RouterProvider><PrivacyPage /></RouterProvider>);
    expect(PRIVACY_NOTICE_VERSION).toBe("1.4");
    expect(screen.getByText(/Instructions check marks:/)).toBeInTheDocument();
    expect(screen.getByText(/a short note \(up to 140 characters\) and one screenshot \(JPEG, PNG or WebP, up to 1 MB\)/)).toBeInTheDocument();
    expect(screen.getByText(/Only your group's members and the class instructor can see them, they are never used in any score or sent to Google, and they are deleted with the group/)).toBeInTheDocument();
  });
});
