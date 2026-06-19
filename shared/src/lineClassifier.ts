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
