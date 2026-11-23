import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { Avatar, clearAvatarCache } from "./Avatar";

vi.mock("../context/AuthContext", () => ({ useAuthOptional: () => ({ token: "tok" }) }));

describe("Avatar", () => {
  beforeEach(() => {
    cleanup();
    clearAvatarCache();
    vi.unstubAllGlobals();
  });

  it("shows initials when the user has no photo and never fetches", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    render(<Avatar userId={1} name="Ada Lovelace" avatarUpdatedAt={null} className="x" />);
    expect(screen.getByText("AL")).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });

  it("falls back to initials when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    render(<Avatar userId={2} name="Grace Hopper" avatarUpdatedAt="2026-01-01T00:00:00Z" />);
    await waitFor(() => expect(screen.getByText("GH")).toBeTruthy());
  });

  it("renders the image and revokes the object URL on unmount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"]) }));
    const revoke = vi.fn();
    const create = vi.fn(() => "blob:fake");
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    try {
      const { container, unmount } = render(<Avatar userId={3} name="Linus T" avatarUpdatedAt="v1" />);
      await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:fake"));
      unmount();
      expect(revoke).toHaveBeenCalledWith("blob:fake");
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });
});
