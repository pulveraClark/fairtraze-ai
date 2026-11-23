import { describe, expect, it } from "vitest";
import { lightRewrite } from "./printDocument";

// The PDF is always the document's own black on white: a dark app theme (class, data attribute or
// the OS prefers-color-scheme) must not reach the offscreen copy. e2e/pdfExport.mjs proves it in a
// real browser; this pins the stylesheet rewrite.
describe("lightRewrite", () => {
  it("switches dark-scheme media rules off and light-scheme ones on", () => {
    const css = "@media (prefers-color-scheme: dark) { a { color: #fff } } @media ( prefers-color-scheme : light ) { a { color: #000 } }";
    const out = lightRewrite(css, "http://localhost/app.css");
    expect(out).not.toMatch(/prefers-color-scheme/);
    expect(out).toContain("@media (max-width: -1px) {"); // never true
    expect(out).toContain("@media (min-width: 0px) {"); // always true
  });

  it("keeps combined conditions valid", () => {
    const out = lightRewrite("@media (prefers-color-scheme: dark) and (min-width: 600px) { b { color: red } }", "http://x/");
    expect(out).toBe("@media (max-width: -1px) and (min-width: 600px) { b { color: red } }");
  });

  it("makes relative url()s absolute, because the text no longer lives at the stylesheet's URL", () => {
    const out = lightRewrite('@font-face { src: url("./fonts/a.woff") } .x { background: url(../img/b.png) } .y { background: url(data:image/png;base64,AAAA) } .z { background: url(https://cdn.example/c.png) }', "http://localhost:5173/assets/index.css");
    expect(out).toContain('url("http://localhost:5173/assets/fonts/a.woff")');
    expect(out).toContain("url(http://localhost:5173/img/b.png)");
    expect(out).toContain("url(data:image/png;base64,AAAA)");
    expect(out).toContain("url(https://cdn.example/c.png)");
  });
});
