// Single source of truth for the Privacy Notice (RA 10173). Imported by both client and server.
// Bump PRIVACY_NOTICE_VERSION whenever the notice materially changes: every user is re-asked
// for consent on their next login. Not scoring code.

export const PRIVACY_NOTICE_VERSION = "1.3";
export const PRIVACY_NOTICE_UPDATED = "2026-10-26";

// One line shown on the consent screen to people who accepted an earlier version.
export const PRIVACY_CHANGE_SUMMARY =
  "Updated: AI work summaries now also read the beginning of commit messages (up to 300 characters) and short excerpts of removed lines, so deleted code can be described. Names, emails and keys are removed first. In this demonstration Google Gemini uses Google's free tier, where Google may use the data to improve its products."

// Contact and retention wording shown on the Privacy Notice; change them here only.
export const PRIVACY_CONTACT_EMAIL = "pulveraedzel@gmail.com";
export const PRIVACY_RETENTION = "until the end of the academic term plus one term, then deletion or anonymization on request";

// Display name used wherever an erased account's contributions remain.
export const FORMER_MEMBER_NAME = "Former member";
