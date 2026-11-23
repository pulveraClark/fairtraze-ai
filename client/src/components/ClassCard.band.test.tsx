import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ClassCard } from "./ClassCard";
import { classAccent } from "../lib/classBand";

function band(classId: number): string {
  const { container } = render(<ClassCard classId={classId} assignmentLabel="CODE — Subject" items={[]} onClick={() => {}} />);
  return container.querySelector<HTMLElement>("div.relative.px-4")?.style.backgroundColor ?? "";
}

function css(color: string): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = color;
  return probe.style.backgroundColor;
}

describe("ClassCard header", () => {
  it("uses the class's accent colour, the same one every time", () => {
    expect(band(3)).not.toBe("");
    expect(band(3)).toBe(css(classAccent(3).color));
    expect(band(3)).toBe(band(3));
  });
  it("differs between neighbouring classes", () => {
    expect(band(3)).not.toBe(band(4));
  });
});
