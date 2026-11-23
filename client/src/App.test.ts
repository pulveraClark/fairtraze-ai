import { describe, it, expect } from "vitest";
import { usesShell } from "./App";
import { getNavItems, isItemActive } from "./lib/navModel";

describe("usesShell", () => {
  it("puts /help in the app shell only for signed-in users", () => {
    expect(usesShell("/help", true)).toBe(true);
    expect(usesShell("/help", false)).toBe(false);
    expect(usesShell("/help")).toBe(false);
  });

  it("keeps the other public pages out of the shell and app pages in", () => {
    for (const p of ["/", "/login", "/privacy"]) expect(usesShell(p, true)).toBe(false);
    for (const p of ["/settings", "/alerts", "/student"]) expect(usesShell(p, true)).toBe(true);
  });

  it("highlights Help in the sidebar on /help for every role", () => {
    for (const role of ["STUDENT", "INSTRUCTOR", "ADMIN"] as const) {
      const help = getNavItems(role, {} as never).find((i) => i.key === "help");
      expect(help, role).toBeDefined();
      expect(isItemActive(role, help!.key, help!.href, "/help")).toBe(true);
    }
  });
});
