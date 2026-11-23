export type LineClass = "code" | "comment" | "blank";

const COMMENT_MARKERS: Record<string, string[]> = {
  // C-family, Go, Rust, Java
  js: ["//", "/*"], ts: ["//", "/*"], jsx: ["//", "/*"], tsx: ["//", "/*"],
  java: ["//", "/*"], c: ["//", "/*"], cpp: ["//", "/*"],
  cs: ["//", "/*"], go: ["//", "/*"], rs: ["//", "/*"],
  // Hash-comment languages
  py: ["#"], rb: ["#"], sh: ["#"], yaml: ["#"], yml: ["#"],
  // Markup
  html: ["<!--"], xml: ["<!--"],
  // SQL / Lua
  sql: ["--"], lua: ["--"],
  // CSS
  css: ["/*"], scss: ["/*"], less: ["/*"],
};

export function classifyAddedLines(
  filename: string,
  addedLines: string[]
): { code: number; comment: number; blank: number } {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const markers = COMMENT_MARKERS[ext] ?? [];

  let code = 0;
  let comment = 0;
  let blank = 0;

  for (const line of addedLines) {
    const trimmed = line.trimStart();
    if (trimmed.length === 0) {
      blank++;
    } else if (markers.length > 0 && markers.some((m) => trimmed.startsWith(m))) {
      comment++;
    } else {
      code++;
    }
  }

  return { code, comment, blank };
}

/**
 * How much one added line is worth by its type. Used by the real GitHub pipeline
 * (server/src/lib/github.ts) and by the scoring fallback, so the numbers live in one place.
 */
export const LINE_TYPE_WEIGHTS: Record<LineClass, number> = { code: 1, comment: 0.25, blank: 0 };

/** Added lines of one file as weighted line-equivalents: code 1.0, comment 0.25, blank 0. */
export function weightedAddedLines(filename: string, addedLines: string[]): number {
  const c = classifyAddedLines(filename, addedLines);
  return c.code * LINE_TYPE_WEIGHTS.code + c.comment * LINE_TYPE_WEIGHTS.comment + c.blank * LINE_TYPE_WEIGHTS.blank;
}
