// Role presentation shared by the sidebar and UserMenu (previously duplicated per component).

export const ROLE_LABEL: Record<string, string> = {
  INSTRUCTOR: "Instructor",
  ADMIN:      "Admin",
  STUDENT:    "Student",
};

export const AVATAR_STYLE: Record<string, string> = {
  INSTRUCTOR: "border-indigo-400 text-indigo-300",
  ADMIN:      "border-amber-400  text-amber-300",
  STUDENT:    "border-teal-400   text-teal-300",
};

export const AVATAR_BG: Record<string, string> = {
  INSTRUCTOR: "rgba(99,102,241,0.15)",
  ADMIN:      "rgba(245,158,11,0.15)",
  STUDENT:    "rgba(20,184,166,0.15)",
};

/** Translucent role badge for dark surfaces. */
export const ROLE_BADGE_DARK: Record<string, string> = {
  INSTRUCTOR: "text-indigo-300 border-indigo-500/50 bg-indigo-500/10",
  ADMIN:      "text-amber-300  border-amber-500/50  bg-amber-500/10",
  STUDENT:    "text-teal-300   border-teal-500/50   bg-teal-500/10",
};

export function initials(name: string): string {
  return name.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}
