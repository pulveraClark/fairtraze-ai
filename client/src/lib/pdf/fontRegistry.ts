import type { FontFace } from "./ops";
import { faceKey } from "./ops";

// The fonts of the writing area. The SAME files are used by the page view (@font-face in index.css)
// and embedded in the PDF, so line breaks and widths cannot differ between screen and file.
// The editor's font menu stores CSS stacks such as "Arial, Helvetica, sans-serif"; index.css maps
// those (inside .ft-doc-content only) to the bundled look-alikes below. Licenses: assets/fonts/LICENSES.md.
//
// Each face comes in "parts" (Fontsource's latin and latin-ext WOFF files, which together cover
// Filipino text, accented Latin and the peso sign). A character is drawn from the first part of
// the family that has it, then from the default family (the same chain the CSS stack uses), and
// is reported as missing only if no bundled font has it.

const URLS = import.meta.glob("../../assets/fonts/*.woff", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const urlOf = (file: string): string => {
  const u = URLS[`../../assets/fonts/${file}.woff`];
  if (!u) throw new Error(`Bundled font file missing: ${file}.woff`);
  return u;
};

export interface DocFamily {
  /** The CSS family name used in @font-face and in the document stack. */
  css: string;
  /** What the editor menu calls it. */
  menu: string;
  /** File stem (assets/fonts/<stem>-<subset>-<weight>-<style>.woff) and which subsets exist. */
  stem: string;
  subsets: ("latin" | "latin-ext")[];
}

export const DOC_FAMILIES: DocFamily[] = [
  { css: "FT Geist", menu: "Default", stem: "geist", subsets: ["latin", "latin-ext"] },
  { css: "FT Sans", menu: "Sans Serif", stem: "arimo", subsets: ["latin", "latin-ext"] },
  { css: "FT Serif", menu: "Serif", stem: "gelasio", subsets: ["latin", "latin-ext"] },
  { css: "FT Mono", menu: "Monospace", stem: "cousine", subsets: ["latin", "latin-ext"] },
  { css: "FT Comic", menu: "Comic Sans", stem: "comic-neue", subsets: ["latin"] },
];

export const DEFAULT_DOC_FAMILY = DOC_FAMILIES[0]!.css;
const byName = new Map(DOC_FAMILIES.map((f) => [f.css, f]));

export const FACE_WEIGHTS = [400, 700] as const;
export const FACE_STYLES = ["normal", "italic"] as const;

/** First family of a computed `font-family` list, unquoted: 'FT Sans', Arial, sans-serif -> FT Sans. */
export function firstFamily(cssFamily: string): string {
  const first = cssFamily.split(",")[0]?.trim() ?? "";
  return first.replace(/^["']|["']$/g, "");
}

/** The bundled family for a computed font-family; anything unknown is drawn in the default face. */
export function resolveDocFamily(cssFamily: string): string {
  const name = firstFamily(cssFamily);
  return byName.has(name) ? name : DEFAULT_DOC_FAMILY;
}

function partUrls(fam: DocFamily, weight: 400 | 700, italic: boolean, base: string): string[] {
  return fam.subsets.map((s) => new URL(urlOf(`${fam.stem}-${s}-${weight}-${italic ? "italic" : "normal"}`), base).href);
}

/**
 * Font files to try, in order, for every face (keyed by faceKey): the family's own parts, then the
 * default family's parts of the same weight and style. What the PDF worker fetches and embeds.
 */
export function fontChains(base: string = typeof location !== "undefined" ? location.href : "http://localhost/"): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const dflt = DOC_FAMILIES[0]!;
  for (const fam of DOC_FAMILIES) {
    for (const weight of FACE_WEIGHTS) {
      for (const italic of [false, true]) {
        const face: FontFace = { family: fam.css, weight, italic };
        const own = partUrls(fam, weight, italic, base);
        out[faceKey(face)] = fam === dflt ? own : [...own, ...partUrls(dflt, weight, italic, base)];
      }
    }
  }
  return out;
}

/** Faces a document of the given families needs loaded before it is measured (screen and PDF). */
export function fontLoadSpecs(families: Iterable<string> = DOC_FAMILIES.map((f) => f.css)): string[] {
  const specs: string[] = [];
  for (const fam of families) {
    for (const w of FACE_WEIGHTS) for (const style of FACE_STYLES) specs.push(`${style} ${w} 16px "${fam}"`);
  }
  return specs;
}

/** Characters that make the browser fetch the latin-ext part as well (peso sign, Eastern European letters). */
export const FONT_LOAD_SAMPLE = "ÑñŁł₱";
