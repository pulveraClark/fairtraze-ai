// Single source of truth for the Privacy Notice (RA 10173). Imported by both client and server.
// Bump PRIVACY_NOTICE_VERSION whenever the notice materially changes: every user is re-asked
// for consent on their next login. Not scoring code.

export const PRIVACY_NOTICE_VERSION = "1.4";
export const PRIVACY_NOTICE_UPDATED = "2026-10-26";

// One line shown on the consent screen to people who accepted an earlier version.
export const PRIVACY_CHANGE_SUMMARY =
  "Updated: the project instructions check can now also read the PDF and images attached to the project instructions. Files are sent as they were attached (images are resized first), so names and keys inside them are not removed. Do not attach personal data or passwords. In this demonstration Google Gemini uses Google's free tier, where Google may use the data to improve its products. Group leaders and instructors can also attach a short note and a screenshot to a project-instructions item."

// Contact and retention wording shown on the Privacy Notice; change them here only.
export const PRIVACY_CONTACT_EMAIL = "pulveraedzel@gmail.com";
export const PRIVACY_RETENTION = "until the end of the academic term plus one term, then deletion or anonymization on request";

// Display name used wherever an erased account's contributions remain.
export const FORMER_MEMBER_NAME = "Former member";
