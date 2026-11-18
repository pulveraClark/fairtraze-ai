import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Flag } from "@shared/types";
import { FlagTag } from "./FlagTag";
import { flagLabel } from "../lib/flagLabel";
import { FLAG_TONE, HEALTH_TONE, PILL_TONES, PILL_TONES_SOFT, StatusPill, toneClasses } from "./ui/StatusPill";

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const FLAGS: Flag[] = ["inactive", "free-rider", "overload", "deadline-driven"];
const tag = (flag: Flag, props: Partial<Parameters<typeof FlagTag>[0]> = {}) => {
  const { container } = render(<FlagTag flag={flag} {...props} />);
  return container.firstElementChild as HTMLElement;
};

describe("instructor flag colours (one table for FlagTag and StatusPill)", () => {
  it("Overload amber, Low contribution (free-rider and inactive) red, Deadline-driven yellow", () => {
    expect(FLAG_TONE).toEqual({ inactive: "red", "free-rider": "red", overload: "amber", "deadline-driven": "yellow" });
  });

  it("FlagTag and StatusPill carry the same colour classes for each flag", () => {
    for (const flag of FLAGS) {
      const t = tag(flag);
      const { container } = render(<StatusPill kind="flag" value={flag} />);
      const pill = container.firstElementChild as HTMLElement;
      for (const cls of toneClasses(FLAG_TONE[flag]).split(" ")) {
        expect(t.className, `${flag} FlagTag`).toContain(cls);
        expect(pill.className, `${flag} StatusPill`).toContain(cls);
      }
    }
  });

  it("every flag has an icon and its name as text", () => {
    for (const flag of FLAGS) {
      const t = tag(flag);
      expect(t.querySelector("svg")).not.toBeNull();
      expect(t).toHaveTextContent(flagLabel(flag));
    }
  });

  it("instructors read 'Low contribution' for free-rider and inactive, never the old words", () => {
    for (const flag of ["free-rider", "inactive"] as Flag[]) {
      const t = tag(flag);
      expect(t.textContent).toBe("Low contribution");
      const { container } = render(<StatusPill kind="flag" value={flag} />);
      expect(container.textContent).toBe("Low contribution");
    }
  });
});

describe("Early data (muted) on the instructor side", () => {
  it("keeps the hue, only softer (dashed), for flags and health", () => {
    for (const flag of FLAGS) {
      const hue = FLAG_TONE[flag];
      const t = tag(flag, { muted: true });
      expect(t.className).toContain(toneClasses(hue, true).split(" ")[0]);
      expect(t.className).toContain("border-dashed");
      expect(t.className).not.toContain("slate");
    }
    const { container } = render(<StatusPill kind="health" value="High Risk" muted />);
    expect((container.firstElementChild as HTMLElement).className).toContain("bg-red-50");
  });

  it("every soft tone keeps 4.5:1 text contrast", () => {
    for (const [tone, v] of Object.entries(PILL_TONES_SOFT)) expect(contrast(v!.fg, v!.bg), tone).toBeGreaterThanOrEqual(4.5);
    for (const tone of [...Object.values(FLAG_TONE), ...Object.values(HEALTH_TONE)]) {
      expect(contrast(PILL_TONES[tone].fg, PILL_TONES[tone].bg), tone).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("student flags are unchanged and never say free-rider", () => {
  it("own flag: amber 'Low contribution'", () => {
    for (const flag of ["free-rider", "inactive"] as Flag[]) {
      const t = tag(flag, { view: "own" });
      expect(t).toHaveTextContent("Low contribution");
      expect(t.className).toContain("bg-amber-50");
      expect(t.className).toContain("border-amber-300");
    }
  });
  it("teammate's flag: neutral grey", () => {
    const t = tag("free-rider", { view: "peer" });
    expect(t).toHaveTextContent("Low contribution");
    expect(t.className).toContain("bg-slate-100");
    expect(t.className).not.toContain("red");
  });
  it("Early data keeps the student look grey, as before", () => {
    const t = tag("free-rider", { view: "own", muted: true });
    expect(t.className).toContain("bg-slate-100");
  });
  it("no student view renders the word free-rider", () => {
    for (const view of ["own", "peer"] as const) for (const muted of [false, true]) {
      const { container } = render(<FlagTag flag="free-rider" view={view} muted={muted} />);
      expect(container.textContent?.toLowerCase()).not.toContain("free-rider");
    }
    expect(screen.queryByText(/free-rider/i)).toBeNull();
  });
});
