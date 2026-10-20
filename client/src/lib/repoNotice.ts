// Plain-language wording about a group's GitHub repository, shared by the instructor screens and the
// student setup card so every place says the same thing. Display only.

export const REPO_NOT_LINKED_PILL = "Repo not linked yet";
export const REPO_NOT_LINKED_MESSAGE = "Link a GitHub repository first.";
export const REPO_NOT_LINKED_HINT = "Any member of the group can add it from the group page.";
export const REPO_CHANGED_NOTICE = "Repository changed. Re-analyze to update.";

/** True for a GitHub or Combined group whose summary says it has no repository. Unknown counts as linked. */
export function repoNotLinked(item: { sourceType?: string | null; hasRepo?: boolean }): boolean {
  return item.sourceType !== "EDITOR" && item.hasRepo === false;
}
