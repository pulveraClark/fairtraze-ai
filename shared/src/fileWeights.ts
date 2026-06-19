export const FILE_WEIGHTS = {
  source:    1.0,
  test:      0.8,
  style:     0.7,
  docs:      0.6,
  other:     0.5,
  config:    0.3,
  generated: 0.0,
} as const;

export type FileCategory = keyof typeof FILE_WEIGHTS;

const SOURCE_EXTS = new Set(["ts","tsx","js","jsx","py","java","c","cpp","cs","go","rs","rb","php","swift","kt"]);
const DOC_EXTS    = new Set(["md","txt","rst","adoc"]);
const STYLE_EXTS  = new Set(["css","scss","less","sass"]);
const CONFIG_EXTS = new Set(["json","yaml","yml","toml","ini","cfg"]);

const GENERATED_FILES    = new Set(["package-lock.json","yarn.lock","pnpm-lock.yaml"]);
const GENERATED_PREFIXES = ["dist/","build/",".next/","node_modules/"];
const GENERATED_SUFFIXES = [".min.js",".min.css",".map"];

const CONFIG_BASENAMES = new Set([
  "dockerfile",".gitignore",".eslintrc",".prettierrc",
  "docker-compose.yml","docker-compose.yaml",
]);

function isGenerated(filename: string): boolean {
  const lower = filename.toLowerCase();
  const base  = lower.split("/").pop() ?? "";
  if (GENERATED_FILES.has(base)) return true;
  if (GENERATED_PREFIXES.some((p) => lower.startsWith(p))) return true;
  if (GENERATED_SUFFIXES.some((s) => lower.endsWith(s))) return true;
  return false;
}

function isTest(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.includes(".test.") ||
    lower.includes(".spec.") ||
    /(^|\/)(__tests__|tests?)\//.test(lower)
  );
}

function isConfig(filename: string, ext: string): boolean {
  const base = filename.split("/").pop()?.toLowerCase() ?? "";
  if (CONFIG_EXTS.has(ext)) return true;
  if (CONFIG_BASENAMES.has(base)) return true;
  if (
    base.endsWith(".env") ||
    base.endsWith(".lock") ||
    base.endsWith(".config.js") ||
    base.endsWith(".config.ts")
  )
    return true;
  return false;
}

export function categorizeFile(filename: string): FileCategory {
  if (isGenerated(filename)) return "generated";
  if (isTest(filename)) return "test";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (SOURCE_EXTS.has(ext)) return "source";
  if (DOC_EXTS.has(ext)) return "docs";
  if (STYLE_EXTS.has(ext)) return "style";
  if (isConfig(filename, ext)) return "config";
  return "other";
}

export function getFileWeight(filename: string): number {
  return FILE_WEIGHTS[categorizeFile(filename)];
}
