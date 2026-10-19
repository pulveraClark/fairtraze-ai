import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ClassCodeLabel } from "./ClassCodeLabel";

describe("ClassCodeLabel", () => {
  it("renders exactly the shared label text, with the EDP part separately styleable", () => {
    const { container } = render(<ClassCodeLabel subjectCode="UXA-101" edpCode="12345" edpClassName="quiet" />);
    expect(container.textContent).toBe("UXA-101 · EDP 12345");
    expect(container.querySelector(".quiet")?.textContent).toBe(" · EDP 12345");
  });
  it("shows just the subject code when there is no EDP code", () => {
    const { container } = render(<ClassCodeLabel subjectCode="UXA-101" />);
    expect(container.textContent).toBe("UXA-101");
  });
});
