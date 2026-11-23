// Master switch for every email feature (verification, resend, password reset).
// Read live (not cached at import time) so tests can flip process.env.EMAIL_ENABLED
// without vi.resetModules(). Defaults to on: only the literal "false" turns it off.
export function isEmailEnabled(): boolean {
  return process.env.EMAIL_ENABLED?.trim().toLowerCase() !== "false";
}

// With email off nobody can ever click a verification link, so every account counts as
// verified (existing unverified rows included) and nothing is blocked.
export function effectiveEmailVerified(user: { emailVerified: boolean }): boolean {
  return user.emailVerified || !isEmailEnabled();
}
