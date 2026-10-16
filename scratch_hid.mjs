import fs from "node:fs";
let f = "src/lib/pdf/collectLayout.ts";
let s = fs.readFileSync(f, "utf8");
const rep = (a, b) => { if (!s.includes(a)) throw new Error("missing: " + a.slice(0, 70)); s = s.replace(a, () => b); };
rep(`  const inBand = (el: Element) => !!el.closest(BAND);`, `  const inBand = (el: Element) => !!el.closest(BAND);
  // Visually hidden text (screen-reader-only labels such as a checklist item's "Task item checkbox
  // for ..."): a 1px box that clips its content, or display/visibility hidden. Never drawn.
  const hiddenCache = new Map<Element, boolean>();
  const isHidden = (el: Element): boolean => {
    const hit = hiddenCache.get(el);
    if (hit !== undefined) return hit;
    const s = cs(el);
    let hidden = s.display === "none" || s.visibility === "hidden";
    if (!hidden && s.overflow !== "visible") {
      const r = el.getBoundingClientRect();
      hidden = r.width <= 1 && r.height <= 1;
    }
    if (!hidden && el.parentElement && el !== root) hidden = isHidden(el.parentElement);
    hiddenCache.set(el, hidden);
    return hidden;
  };`);
rep(`    if (t.data.trim() && t.parentElement && !skipped(t)) texts.push(t);`, `    if (t.data.trim() && t.parentElement && !skipped(t) && !isHidden(t.parentElement)) texts.push(t);`);
rep(`    if (skipped(el) || inBand(el) || el.tagName === "BR" || el.tagName === "IMG") continue;`, `    if (skipped(el) || inBand(el) || el.tagName === "BR" || el.tagName === "IMG" || isHidden(el)) continue;`);
fs.writeFileSync(f, s);

f = "e2e/pdfExport.mjs";
s = fs.readFileSync(f, "utf8");
rep(`    const tokens = tc.items.flatMap((it) => it.str.split(/\s+/)).filter(Boolean);`, `    // Items are joined as they were drawn (a subscript "2" in "H2O" is its own item) and cut into words at whitespace.
    const tokens = tc.items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join("").split(/\s+/).filter(Boolean);`);
// text-order check: whitespace-free equality after removing the known extras
const a = s.indexOf("    const pdfWords = pdf.pages.flatMap((p) => p.tokens);");
const b = s.indexOf("    const seen = new Map();");
if (a < 0 || b < 0) throw new Error("order markers");
s = s.slice(0, a) + `    // The document's words, in order, must be exactly what the PDF contains once the known extras
    // (header/footer text, page numbers, list numbers) are taken out. Compared without whitespace so a
    // long URL that wraps (cut into several lines) still equals the one word it is.
    const pdfText = pdf.pages.flatMap((p) => p.tokens).filter((w) => !allowed(w)).join("");
    const wantText = r.screen.docWords.join("");
    if (!r.pdf.missing.length && pdfText !== wantText) {
      let i = 0;
      while (i < pdfText.length && pdfText[i] === wantText[i]) i++;
      fail(c, \`extracted text differs from the document text at character \${i}: PDF "\${pdfText.slice(Math.max(0, i - 15), i + 25)}" vs document "\${wantText.slice(Math.max(0, i - 15), i + 25)}"\`);
    }
` + s.slice(b);
fs.writeFileSync(f, s);
