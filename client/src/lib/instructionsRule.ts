import type { BriefDraft } from "./briefAttachments";

// "Instructions" (formerly "Description (optional)") are required when a project is created or
// saved. The AI review reads them, so a project without any gives it nothing to check against.
// Mirrors server/src/routes/assignments.ts, which has the final say.

export const INSTRUCTIONS_REQUIRED_CREATE =
  "Write the project instructions. The AI review uses them to check the group's work.";
export const INSTRUCTIONS_REQUIRED_EDIT =
  "Add instructions as text, or keep a PDF or image. The AI review uses them to check the group's work.";

/** Create: text is required. Edit: text, or at least one PDF/image that will still be attached. */
export function instructionsProblem(mode: "create" | "edit", text: string, draft: BriefDraft): string | null {
  if (text.trim()) return null;
  if (mode === "create") return INSTRUCTIONS_REQUIRED_CREATE;
  const hasFile = draft.images.length > 0 || draft.pdf !== null;
  return hasFile ? null : INSTRUCTIONS_REQUIRED_EDIT;
}
