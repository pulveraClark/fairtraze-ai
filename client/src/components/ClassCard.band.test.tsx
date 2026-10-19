import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ClassCard } from "./ClassCard";
import { CLASS_BAND_BACKGROUND } from "../lib/classBand";

function band(label: string): string {
  const { container } = render(<ClassCard assignmentLabel={label} items={[]} onClick={() => {}} />);
  const el = container.querySelector<HTMLElement>("div.relative.px-4");
  return el?.style.backgroundColor ?? "";
}

describe("ClassCard header", () => {
  it("uses the same neutral colour whatever the class is called", () => {
    const a = band("CC-APPSDEV22 — Applications Development");
    const b = band("IT-ELEC 2 — IT Elective 2");
    const c = band("Test — test");
    expect(a).not.toBe("");
    expect(a).toBe(b);
    expect(b).toBe(c);
    const probe = document.createElement("div");
    probe.style.backgroundColor = CLASS_BAND_BACKGROUND;
    expect(a).toBe(probe.style.backgroundColor);
  });
});
