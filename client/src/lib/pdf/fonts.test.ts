// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { DOC_FAMILIES, FACE_STYLES, FACE_WEIGHTS, firstFamily, fontChains, resolveDocFamily } from "./fontRegistry";
import { faceKey } from "./ops";

const here = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.resolve(here, "../../assets/fonts");
const FILES = fs.readdirSync(FONT_DIR).filter((f) => f.endsWith(".woff"));

// Filipino text: ñ Ñ, the accented vowels and the peso sign, plus the basics every document uses.
const FILIPINO = "ñÑáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙâêîôûüÜ₱";
const BASICS = "AaBbZz09 .,;:!?'\"-–—()[]{}/@#%&*+=<>©®™•…€";

type FK = { hasGlyphForCodePoint(cp: number): boolean; unitsPerEm: number };
const load = (file: string) => new Uint8Array(fs.readFileSync(path.join(FONT_DIR, file)));
const fileOf = (url: string) => path.basename(url.split("?")[0]!);

describe("bundled document fonts", () => {
  it("has latin(+latin-ext) WOFF for bold, italic and bold italic of every family (36 files, none missing)", () => {
    expect(FILES).toHaveLength(36);
    for (const fam of DOC_FAMILIES) {
      for (const w of FACE_WEIGHTS) for (const s of FACE_STYLES) {
        for (const sub of fam.subsets) expect(FILES, `${fam.css} ${sub} ${w} ${s}`).toContain(`${fam.stem}-${sub}-${w}-${s}.woff`);
      }
    }
  });

  it("ships the license text for every family", () => {
    const lic = fs.readFileSync(path.join(FONT_DIR, "LICENSES.md"), "utf8");
    for (const name of ["Geist", "Arimo", "Gelasio", "Cousine", "Comic Neue"]) expect(lic, name).toContain(name);
    expect((lic.match(/SIL OPEN FONT LICENSE Version 1\.1/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it.each(FILES)("%s parses with fontkit and subsets cleanly into a PDF", async (file) => {
    const bytes = load(file);
    const fk = fontkit.create(bytes) as unknown as FK;
    expect(fk.unitsPerEm).toBeGreaterThan(0);
    // The real path: pdf-lib subsetting (WOFF2 crashes here for Geist, which is why WOFF is used).
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(bytes, { subset: true });
    const page = doc.addPage([300, 200]);
    // Draw only characters this part has (a latin-ext part has no basic Latin).
    const text = [...`Ñandú año niño café ${FILIPINO} ŁÅ₱`].filter((c) => fk.hasGlyphForCodePoint(c.codePointAt(0)!)).join("");
    expect(text.length).toBeGreaterThan(0);
    page.drawText(text, { font, size: 10, x: 10, y: 100 });
    const out = await doc.save();
    expect(out.length).toBeGreaterThan(300);
    expect(out.length).toBeLessThan(bytes.length * 2); // a subset, not the whole font twice
  });

  it("every face covers Filipino text, the peso sign and the basics through its own parts + the default fallback", () => {
    const chains = fontChains("http://localhost/");
    for (const fam of DOC_FAMILIES) {
      for (const weight of FACE_WEIGHTS) for (const italic of [false, true]) {
        const key = faceKey({ family: fam.css, weight, italic });
        const fonts = chains[key]!.map((u) => fontkit.create(load(fileOf(u))) as unknown as FK);
        for (const ch of FILIPINO + BASICS) {
          expect(
            fonts.some((f) => f.hasGlyphForCodePoint(ch.codePointAt(0)!)),
            `${key} has no glyph for "${ch}" (U+${ch.codePointAt(0)!.toString(16)})`
          ).toBe(true);
        }
      }
    }
  });

  it("each family's own latin part alone covers ñ Ñ and every accented vowel (no fallback needed)", () => {
    for (const fam of DOC_FAMILIES) {
      for (const w of FACE_WEIGHTS) for (const s of FACE_STYLES) {
        const fk = fontkit.create(load(`${fam.stem}-latin-${w}-${s}.woff`)) as unknown as FK;
        for (const ch of FILIPINO.replace("₱", "")) expect(fk.hasGlyphForCodePoint(ch.codePointAt(0)!), `${fam.stem} ${w} ${s} lacks "${ch}"`).toBe(true);
      }
    }
  });

  it("resolves the stacks the editor menu stores to the bundled families", () => {
    expect(firstFamily('"FT Sans", "FT Geist", Arial, Helvetica, sans-serif')).toBe("FT Sans");
    expect(resolveDocFamily('"FT Serif", Georgia, serif')).toBe("FT Serif");
    expect(resolveDocFamily('"FT Mono", "Courier New", monospace')).toBe("FT Mono");
    expect(resolveDocFamily('"FT Comic", "Comic Sans MS", cursive')).toBe("FT Comic");
    expect(resolveDocFamily("ui-sans-serif, system-ui")).toBe("FT Geist"); // unknown -> default
  });

  it("index.css declares every file once with a unicode-range, and scopes the stack mapping to the writing area only", () => {
    const css = fs.readFileSync(path.resolve(here, "../../index.css"), "utf8");
    for (const f of FILES) expect(css.split(`./assets/fonts/${f}`).length - 1, f).toBe(1);
    const faces = css.split("\n").filter((l) => l.includes("@font-face"));
    expect(faces).toHaveLength(36);
    for (const l of faces) expect(l).toMatch(/unicode-range: U\+/);
    const rules = css.split("\n").filter((l) => /\[style\*="(Arial|Georgia|Courier New|Comic Sans)"\]/.test(l));
    expect(rules.length).toBeGreaterThanOrEqual(4);
    for (const r of rules) expect(r.trimStart().startsWith(".ft-doc-content")).toBe(true);
    // The private family names never appear in UI rules, and the mapped stacks fall back to the default face.
    for (const line of css.split("\n")) {
      if (line.includes("@font-face") || line.includes(".ft-doc-content")) continue;
      expect(line, line).not.toMatch(/font-family:[^;]*"FT (Geist|Sans|Serif|Mono|Comic)"/);
    }
    for (const r of rules) expect(r).toContain('"FT Geist"');
  });
});
