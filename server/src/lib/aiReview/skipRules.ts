import { categorizeFile } from "@shared/fileWeights.js";

// Which changed files never go to Gemini. Pure; the evidence builders call it per file.

export type SkipReason = "generated" | "lock" | "binary" | "no-patch" | "vendor" | "secret-file" | "large-svg";

const LOCK_BASENAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "cargo.lock", "poetry.lock",
  "composer.lock", "gemfile.lock", "go.sum", "pipfile.lock", "bun.lockb",
]);

const BINARY_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tiff", "pdf", "zip", "gz", "tar", "7z", "rar",
  "woff", "woff2", "ttf", "otf", "eot", "mp3", "mp4", "mov", "avi", "wav", "ogg", "webm",
  "exe", "dll", "so", "dylib", "class", "jar", "pyc", "bin", "db", "sqlite", "sqlite3", "docx", "xlsx", "pptx",
]);

const VENDOR_RE = /(^|\/)(node_modules|vendor|\.git|\.venv|venv|__pycache__|bower_components)\//i;

const SECRET_BASENAME_RE = /^(\.env(\..*)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|credentials(\..*)?|secrets?(\..*)?|.*\.keystore)$/i;

export const LARGE_SVG_CHARS = 20_000;

export function skipReason(path: string, opts: { hasPatch?: boolean; patchChars?: number } = {}): SkipReason | null {
  const lower = path.toLowerCase();
  const base = lower.split("/").pop() ?? "";
  const ext = base.includes(".") ? base.split(".").pop()! : "";

  if (SECRET_BASENAME_RE.test(base) && !/\.env\.(example|sample|template)$/i.test(base)) return "secret-file";
  if (VENDOR_RE.test(lower)) return "vendor";
  if (LOCK_BASENAMES.has(base) || base.endsWith(".lock")) return "lock";
  if (categorizeFile(path) === "generated") return "generated";
  if (BINARY_EXTS.has(ext)) return "binary";
  if (ext === "svg" && (opts.patchChars ?? 0) > LARGE_SVG_CHARS) return "large-svg";
  if (opts.hasPatch === false) return "no-patch";
  return null;
}

export function shouldSend(path: string, opts?: { hasPatch?: boolean; patchChars?: number }): boolean {
  return skipReason(path, opts) === null;
}
