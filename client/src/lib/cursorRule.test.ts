import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Tailwind v4 preflight gives buttons the default arrow. index.css holds one global rule instead of a
// cursor-pointer on every component; these tests check that it exists and what it covers.
const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
const block = css.slice(css.indexOf("@layer base {", css.indexOf("/* ── Cursors")));

describe("global cursor rule (index.css)", () => {
  it("is a base-layer rule, so explicit cursor utilities still win", () => {
    expect(block.startsWith("@layer base {")).toBe(true);
  });

  it("covers the clickable things, disabled controls and draggable cards", () => {
    for (const s of ["button", "summary", "select", "a[href]", '[role="button"]', '[role="tab"]', '[role="menuitem"]', "label[for]"]) {
      expect(block).toContain(s);
    }
    expect(block).toMatch(/cursor:\s*pointer/);
    expect(block).toMatch(/cursor:\s*not-allowed/);
    expect(block).toMatch(/cursor:\s*grab;/);
    expect(block).toMatch(/cursor:\s*grabbing/);
    expect(block).toContain('aria-roledescription="sortable"');
  });

  it("leaves the document writing area alone", () => {
    expect(block).toContain(":not(.ft-doc-content *)");
  });
});

describe("global cursor rule: computed styles", () => {
  beforeAll(() => {
    // jsdom does not know @layer, so apply the same rules without the wrapper.
    const inner = block.replace(/^@layer base \{/, "").replace(/\}\s*$/, "");
    const style = document.createElement("style");
    style.textContent = inner;
    document.head.appendChild(style);
  });
  const cursorOf = (html: string) => {
    document.body.innerHTML = html;
    return getComputedStyle(document.body.firstElementChild as Element).cursor;
  };

  it("pointer on button, tab, summary, select, link with href", () => {
    expect(cursorOf("<button>x</button>")).toBe("pointer");
    expect(cursorOf('<div role="tab">x</div>')).toBe("pointer");
    expect(cursorOf("<summary>x</summary>")).toBe("pointer");
    expect(cursorOf("<select></select>")).toBe("pointer");
    expect(cursorOf('<a href="/x">x</a>')).toBe("pointer");
  });
  it("not a pointer on a link without href, not-allowed when disabled", () => {
    expect(cursorOf("<a>x</a>")).not.toBe("pointer");
    expect(cursorOf("<button disabled>x</button>")).toBe("not-allowed");
    expect(cursorOf('<div role="button" aria-disabled="true">x</div>')).toBe("not-allowed");
  });
  it("grab on draggable task cards", () => {
    expect(cursorOf('<button aria-roledescription="sortable">x</button>')).toBe("grab");
  });
});
