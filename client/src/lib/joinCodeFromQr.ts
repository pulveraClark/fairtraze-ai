// The instructor's class QR encodes `${origin}/join?code=<code>` (ClassPage / InstructorDashboardPage),
// but a bare code is also accepted. Returns null when nothing usable is found.
export function extractJoinCode(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const code = url.searchParams.get("code")?.trim();
    return code || null;
  } catch {
    // Not a URL — treat as a bare code (no whitespace allowed in a real code).
    return /\s/.test(text) ? null : text;
  }
}
