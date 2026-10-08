import type { AppRoute } from "../router";

/** Role-aware "home" route + label, for back-links on pages shared across roles. */
export function roleHome(role: string | undefined): { route: AppRoute; label: string } {
  if (role === "ADMIN") return { route: "/admin", label: "Admin" };
  if (role === "STUDENT") return { route: "/student", label: "Dashboard" };
  if (role === "INSTRUCTOR") return { route: "/dashboard", label: "Dashboard" };
  return { route: "/", label: "Home" };
}
