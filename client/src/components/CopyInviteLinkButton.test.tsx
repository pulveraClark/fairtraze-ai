import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyInviteLinkButton } from "./CopyInviteLinkButton";

const toast = vi.fn();
vi.mock("./Toast", () => ({ useToast: () => ({ showSuccessToast: toast, showToast: vi.fn() }) }));
afterEach(() => { toast.mockClear(); });

describe("CopyInviteLinkButton", () => {
  it("copies the invite URL and confirms with a toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CopyInviteLinkButton code="AB12" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy invite link" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join?code=AB12`);
    expect(toast).toHaveBeenCalledWith("Invite link copied");
  });
  it("falls back to a selected, read-only field when the clipboard refuses", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true });
    render(<CopyInviteLinkButton code="AB12" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy invite link" }));
    const field = screen.getByLabelText(/Copy this link/) as HTMLInputElement;
    expect(field.readOnly).toBe(true);
    expect(field.value).toBe(`${window.location.origin}/join?code=AB12`);
    expect(toast).not.toHaveBeenCalled();
  });
});
