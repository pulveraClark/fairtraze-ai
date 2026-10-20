import { describe, it, expect } from "vitest";
import { parseAdminUsersView, serializeAdminUsersView, DEFAULT_VIEW, hasActiveFilters, clearFilters } from "./adminUsersUrl";

describe("adminUsersUrl", () => {
  it("round-trips a full view", () => {
    const view = { q: "pat lee", role: "STUDENT", status: "inactive", lastActive: "30d", sort: "name", dir: "desc", page: 3, former: true } as const;
    expect(parseAdminUsersView(serializeAdminUsersView(view))).toEqual(view);
  });

  it("omits defaults so a clean view has an empty query string", () => {
    expect(serializeAdminUsersView(DEFAULT_VIEW)).toBe("");
    expect(serializeAdminUsersView({ ...DEFAULT_VIEW, sort: "name", dir: "asc" })).toBe("?sort=name&dir=asc");
  });

  it("falls back to defaults for unknown or malformed values", () => {
    const v = parseAdminUsersView("?role=ROOT&status=x&active=1y&sort=passwordHash&dir=up&page=-4&former=yes");
    expect(v).toEqual(DEFAULT_VIEW);
  });

  it("uses A-Z for names and newest-first for dates when dir is missing", () => {
    expect(parseAdminUsersView("?sort=name").dir).toBe("asc");
    expect(parseAdminUsersView("?sort=lastActive").dir).toBe("desc");
  });

  it("keeps params it does not own", () => {
    expect(serializeAdminUsersView({ ...DEFAULT_VIEW, role: "ADMIN" }, "?section=instructor-approvals&role=STUDENT"))
      .toBe("?section=instructor-approvals&role=ADMIN");
  });

  it("clearFilters keeps sort, resets page", () => {
    const v = clearFilters({ ...DEFAULT_VIEW, q: "a", status: "active", sort: "name", dir: "asc", page: 4 });
    expect(hasActiveFilters(v)).toBe(false);
    expect(v).toMatchObject({ sort: "name", dir: "asc", page: 1 });
  });
});
