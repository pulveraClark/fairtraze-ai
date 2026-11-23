import { describe, it, expect } from "vitest";
import {
  AUTHOR_SLOTS,
  TINT_ALPHA,
  buildMemberRoster,
  getUserColor,
  getUserTint,
  getUserUnderlineStyle,
  tintOverWhite,
} from "./collabColors";

// ---- color math used by the validator (WCAG contrast, CIE Lab dE76, Machado 2009 CVD simulation)
type RGB = [number, number, number];
const rgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const lin = (c: number) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const gam = (v: number) => {
  v = Math.min(1, Math.max(0, v));
  return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
};
const lum = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const contrast = (a: RGB, b: RGB) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const lab = (c: RGB) => {
  const [r, g, b] = c.map(lin) as RGB;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const dE = (a: RGB, b: RGB) => {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
};
const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
} as const;
const sim = (c: RGB, kind: keyof typeof CVD): RGB => {
  const l = c.map(lin);
  return CVD[kind].map((r) => gam(r[0]! * l[0]! + r[1]! * l[1]! + r[2]! * l[2]!)) as RGB;
};

const WHITE: RGB = [255, 255, 255];
const TEXT: RGB = rgb("#0f172a"); // slate-900, the document text color family
const FIRST_SIX = AUTHOR_SLOTS.slice(0, 6);
const pairs = <T,>(xs: readonly T[]) => xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b] as const));

describe("author palette validator", () => {
  it("every marker is at least 4.5:1 against white (white initials on chips, underline >= 3:1)", () => {
    for (const s of AUTHOR_SLOTS) expect(contrast(rgb(s.marker), WHITE), s.name).toBeGreaterThanOrEqual(4.5);
  });

  it("document text stays at least 4.5:1 on every tint", () => {
    for (const s of AUTHOR_SLOTS) expect(contrast(TEXT, tintOverWhite(s.marker)), s.name).toBeGreaterThanOrEqual(4.5);
  });

  it("the first six markers are clearly different for normal vision (dE >= 25)", () => {
    for (const [a, b] of pairs(FIRST_SIX)) {
      expect(dE(rgb(a.marker), rgb(b.marker)), `${a.name}/${b.name}`).toBeGreaterThanOrEqual(25);
    }
  });

  it("the first six stay apart under protan and deutan simulation (dE >= 5), and every pair under dE 12 has a different underline style", () => {
    for (const [a, b] of pairs(FIRST_SIX)) {
      for (const kind of ["protan", "deutan"] as const) {
        const d = dE(sim(rgb(a.marker), kind), sim(rgb(b.marker), kind));
        expect(d, `${a.name}/${b.name} ${kind}`).toBeGreaterThanOrEqual(5);
        if (d < 12) expect(a.style, `${a.name}/${b.name} weak under ${kind}`).not.toBe(b.style);
      }
    }
  });

  it("blue and orange (colorblind-safe pair) are the first two; orange/gold and teal/magenta use different styles", () => {
    expect(AUTHOR_SLOTS[0]!.name).toBe("blue");
    expect(AUTHOR_SLOTS[1]!.name).toBe("orange");
    const style = (n: string) => AUTHOR_SLOTS.find((s) => s.name === n)!.style;
    expect(style("orange")).not.toBe(style("gold"));
    expect(style("teal")).not.toBe(style("magenta"));
  });

  it("neighbouring slots never share an underline style; only solid, dashed and dotted are used", () => {
    for (let i = 0; i < AUTHOR_SLOTS.length - 1; i++) {
      expect(AUTHOR_SLOTS[i]!.style).not.toBe(AUTHOR_SLOTS[i + 1]!.style);
    }
    for (const s of AUTHOR_SLOTS) expect(["solid", "dashed", "dotted"]).toContain(s.style);
  });

  it("slot markers are unique", () => {
    expect(new Set(AUTHOR_SLOTS.map((s) => s.marker)).size).toBe(AUTHOR_SLOTS.length);
  });
});

describe("getUserColor / tint / style", () => {
  it("is deterministic and pinned: the second member of a roster gets orange", () => {
    const roster = [5, 12, 22];
    expect(getUserColor(12, roster)).toBe(getUserColor(12, roster));
    expect(getUserColor(12, roster)).toBe("#C75000");
    expect(getUserColor(5, roster)).toBe("#0072B2");
  });

  it("gives distinct colors to ids that would collide mod the palette size", () => {
    expect(getUserColor(12, [12, 22])).not.toBe(getUserColor(22, [12, 22]));
  });

  it("falls back to raw-id indexing for a userId absent from the roster", () => {
    expect(getUserColor(7, [5, 12, 22])).toBe(getUserColor(7, []));
  });

  it("tint is the marker at TINT_ALPHA; style comes from the slot", () => {
    expect(getUserTint(5, [5])).toBe(`rgba(0, 114, 178, ${TINT_ALPHA})`);
    expect(getUserUnderlineStyle(5, [5])).toBe("solid");
    expect(getUserUnderlineStyle(12, [5, 12])).toBe("dashed");
  });

  it("all call sites agree: color depends only on (userId, roster)", () => {
    const roster = buildMemberRoster([{ userId: 22 }, { userId: 5 }, { userId: 12 }]);
    const colors = [1, 2, 3, 4, 5].map(() => getUserColor(12, roster));
    expect(new Set(colors).size).toBe(1);
  });
});

describe("buildMemberRoster", () => {
  it("without join dates, sorts by userId ascending", () => {
    expect(buildMemberRoster([{ userId: 22 }, { userId: 5 }, { userId: 12 }])).toEqual([5, 12, 22]);
  });

  it("returns an empty roster for an empty member list", () => {
    expect(buildMemberRoster([])).toEqual([]);
  });

  it("orders by join date, then userId", () => {
    const roster = buildMemberRoster([
      { userId: 30, joinedAt: "2026-11-01T00:00:00Z" },
      { userId: 10, joinedAt: "2026-11-03T00:00:00Z" },
      { userId: 20, joinedAt: "2026-11-01T00:00:00Z" },
    ]);
    expect(roster).toEqual([20, 30, 10]);
  });

  it("a member who joins later (even with a lower id) never changes anyone's color", () => {
    const before = buildMemberRoster([
      { userId: 40, joinedAt: "2026-11-01T00:00:00Z" },
      { userId: 50, joinedAt: "2026-11-02T00:00:00Z" },
    ]);
    const after = buildMemberRoster([
      { userId: 40, joinedAt: "2026-11-01T00:00:00Z" },
      { userId: 50, joinedAt: "2026-11-02T00:00:00Z" },
      { userId: 3, joinedAt: "2026-11-09T00:00:00Z" },
    ]);
    expect(getUserColor(40, after)).toBe(getUserColor(40, before));
    expect(getUserColor(50, after)).toBe(getUserColor(50, before));
    expect(getUserColor(3, after)).not.toBe(getUserColor(40, after));
  });

  it("appends former members who wrote text, without duplicating current members", () => {
    const roster = buildMemberRoster([{ userId: 1, joinedAt: "2026-11-01T00:00:00Z" }], [9, 1, 4, 9]);
    expect(roster).toEqual([1, 4, 9]);
  });

  it("ignores unparseable join dates", () => {
    expect(buildMemberRoster([{ userId: 2, joinedAt: "nope" }, { userId: 1, joinedAt: null }])).toEqual([1, 2]);
  });
});
