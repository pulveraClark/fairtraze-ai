// Link safety for FairTraze Docs. Layout/formatting only - never read by scoring.
// One allow-list shared by the link dialog, the editor's render-time guard, the PDF print copy and
// the .docx export, so a hostile href that arrives through the shared Yjs document (a modified
// client can write any mark attribute) is never rendered clickable or exported.
//
// This file is plain ASCII on purpose: every special character is a numeric code point below, so
// editors do not flag invisible characters or unusual line terminators.

export const ALLOWED_LINK_PROTOCOLS = ["http", "https", "mailto"] as const;

const MAX_LINK_LENGTH = 2048;

// Characters browsers ignore inside a URL scheme ("java\tscript:", " javascript:"), or that hide
// one: C0 controls and space (0x00-0x20), DEL and C1 controls (0x7f-0x9f), zero-width and
// direction marks (0x200b-0x200f), line/paragraph separators (0x2028, 0x2029) and the BOM (0xfeff).
function isInvisible(code: number): boolean {
  return (
    code <= 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0xfeff
  );
}

function stripInvisible(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (!isInvisible(value.charCodeAt(i))) out += value[i];
  }
  return out;
}

function hasInvisibleOrUnsafe(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (isInvisible(c) || c === 0x3c || c === 0x3e || c === 0x22) return true; // < > "
  }
  return false;
}

/**
 * Returns a safe, normalised URL or null when it must be rejected.
 * - http:, https: and mailto: are kept as typed.
 * - A bare domain such as "example.com/page" becomes "https://example.com/page".
 * - Anything with another scheme (javascript:, data:, vbscript:, file:, ...) is rejected.
 */
export function normalizeLinkUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_LINK_LENGTH) return null;

  const compact = stripInvisible(trimmed);
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  if (scheme) {
    const proto = scheme[1].toLowerCase();
    if ((ALLOWED_LINK_PROTOCOLS as readonly string[]).includes(proto)) {
      // A stored/typed URL must be free of hidden characters so what is checked is what is used.
      if (hasInvisibleOrUnsafe(trimmed)) return null;
      if (proto === "mailto") return compact.length > "mailto:".length ? trimmed : null;
      return /^https?:\/\/[^/]/i.test(compact) ? trimmed : null;
    }
    // "localhost:3000" and "example.com:8080/x" look like a scheme but are host:port. Only a
    // purely numeric port makes it a host:port; every real scheme stays rejected.
    if (!/^[a-z0-9.-]+:\d+(\/|$|\?|#)/i.test(compact)) return null;
  }
  if (compact.startsWith("//")) return null; // protocol-relative: no explicit scheme to vet
  if (hasInvisibleOrUnsafe(trimmed)) return null;
  // Bare domain / host:port. Require a dot or a port so a plain word is rejected.
  if (!/^[^/?#]+\.[^/?#]+|^[a-z0-9.-]+:\d+/i.test(compact)) return null;
  return `https://${trimmed}`;
}

/** True when `url` is already safe exactly as stored (used as a render/export-time guard). */
export function isSafeLinkUrl(url: string | null | undefined): boolean {
  if (typeof url !== "string") return false;
  const out = normalizeLinkUrl(url);
  // A stored href must be explicitly http(s)/mailto - bare domains are normalised at entry, so a
  // stored value that needed normalising did not come from our dialog.
  return out !== null && out === url.trim() && /^(https?:|mailto:)/i.test(out);
}
