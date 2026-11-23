import { EMAIL_RE } from "../geminiPseudonyms.js";

// Best-effort removal of secrets and emails before any student text is sent to Gemini (RA 10173).
// It cannot catch everything; the Privacy Notice says so. Order matters: whole blocks first, then
// known token shapes, then named assignments, then anything that merely looks random.

export const REDACTED = "[redacted]";

const PEM_BLOCK_RE = /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE|PGP[A-Z ]*BLOCK)-----[\s\S]*?(?:-----END [A-Z ]*-----|$)/g;

// Token shapes with a fixed, recognisable prefix.
const KNOWN_TOKEN_RES: RegExp[] = [
  /\bAKIA[0-9A-Z]{16}\b/g,                       // AWS access key id
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,             // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,           // GitHub fine-grained tokens
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,                 // Google API keys
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,           // Slack tokens
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,                  // generic "sk-" secret keys
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/g, // Authorization header values
];

// Names that mean "this value is a secret". Prefix and suffix are allowed (DB_PASSWORD, apiKeyValue).
const SECRET_NAME = "(?:secret|token|passw(?:or)?d|pwd|api[_-]?key|private[_-]?key|access[_-]?key|auth[_-]?key|credential|client[_-]?secret|\\bkey)";
// name = value, name: value, "name": "value". Keeps the name, replaces the value.
const NAMED_SECRET_RE = new RegExp(
  `(\\b[\\w.-]*${SECRET_NAME}[\\w.-]*["']?\\s*[:=]\\s*["']?)([^\\s"',;]{6,})`,
  "gi",
);

// A UUID is harmless as an id but is a common API-key format when assigned to a key-like name.
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NAMED_UUID_RE = new RegExp(
  `(\\b[\\w.-]*${SECRET_NAME}[\\w.-]*["']?\\s*[:=]\\s*["']?)${UUID}`,
  "gi",
);

// 32+ characters of base64/url-safe alphabet.
const LONG_TOKEN_RE = /\b[A-Za-z0-9_\-+=]{32,}\b/g;

function shannonEntropy(s: string): number {
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

// Random-looking: mixes letters and digits and has more than hex-level entropy (hex tops out at 4 bits,
// so git SHAs and md5/sha digests are left alone; they carry no secret).
function looksRandom(token: string): boolean {
  if (!/[A-Za-z]/.test(token) || !/\d/.test(token)) return false;
  return shannonEntropy(token) > 4.2;
}

export function redactSecrets(text: string): string {
  let out = text.replace(PEM_BLOCK_RE, REDACTED);
  for (const re of KNOWN_TOKEN_RES) out = out.replace(re, REDACTED);
  out = out.replace(NAMED_UUID_RE, (_m, prefix: string) => `${prefix}${REDACTED}`);
  out = out.replace(NAMED_SECRET_RE, (_m, prefix: string, value: string) =>
    value === REDACTED || value.startsWith("[redacted") ? `${prefix}${value}` : `${prefix}${REDACTED}`,
  );
  out = out.replace(LONG_TOKEN_RE, (tok) => (looksRandom(tok) ? REDACTED : tok));
  out = out.replace(EMAIL_RE, "[email removed]");
  return out;
}
