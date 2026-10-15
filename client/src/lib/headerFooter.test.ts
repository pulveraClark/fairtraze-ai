import { describe, expect, it } from "vitest";
import { EMPTY_HEADER_FOOTER, HF_SLOT_MAX_CHARS, hasHeaderFooterText, headerFooterHtml } from "./headerFooter";

describe("headerFooterHtml", () => {
  it("adds nothing when every slot is empty (the app adds no header or footer of its own)", () => {
    expect(headerFooterHtml(EMPTY_HEADER_FOOTER, "header")).toEqual(["", ""]);
    expect(headerFooterHtml(EMPTY_HEADER_FOOTER, "footer")).toEqual(["", ""]);
    expect(hasHeaderFooterText(EMPTY_HEADER_FOOTER)).toBe(false);
  });

  it("escapes everything typed - it is plain text, never HTML", () => {
    const [left, right] = headerFooterHtml(
      { left: '<img src=x onerror="alert(1)">', center: "<script>1</script>", right: "a & b 'c'" },
      "header"
    );
    expect(left).not.toContain("<img");
    expect(left).not.toContain("<script");
    expect(left).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(left).toContain("&lt;script&gt;1&lt;/script&gt;");
    expect(right).toContain("a &amp; b &#39;c&#39;");
  });

  it("turns every {page} into the page counter (header and footer use different counters)", () => {
    const [hl] = headerFooterHtml({ left: "Page {page} of {page}", center: "", right: "" }, "header");
    expect(hl.match(/rm-page-number-plus/g)).toHaveLength(2);
    expect(hl).not.toContain("{page}");
    const [fl] = headerFooterHtml({ left: "{page}", center: "", right: "" }, "footer");
    expect(fl).toContain('class="rm-page-number"');
    expect(fl).not.toContain("rm-page-number-plus");
  });

  it("puts left and centre in the first string and right in the second", () => {
    const [l, r] = headerFooterHtml({ left: "L", center: "C", right: "R" }, "footer");
    expect(l).toContain("ft-hf-left");
    expect(l).toContain("ft-hf-center");
    expect(l).not.toContain("ft-hf-right");
    expect(r).toContain("ft-hf-right");
  });

  it("keeps the band one line tall when only the centre has text", () => {
    const [l] = headerFooterHtml({ left: "", center: "Only centre", right: "" }, "header");
    expect(l).toContain("&nbsp;");
  });

  it("caps each slot", () => {
    const [l] = headerFooterHtml({ left: "x".repeat(HF_SLOT_MAX_CHARS + 50), center: "", right: "" }, "header");
    expect(l.match(/x/g)).toHaveLength(HF_SLOT_MAX_CHARS);
  });
});
