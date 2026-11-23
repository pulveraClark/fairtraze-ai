// One definition of "the latest analysis" so every page that shows a group's flags or shares
// picks the same Report row. `id` breaks a tie if two rows ever share a generatedAt.
export const LATEST_REPORT_ORDER = [{ generatedAt: "desc" }, { id: "desc" }] as const;
