import { describe, expect, it } from "vitest";
import { emptyDraft } from "./briefAttachments";
import { instructionsProblem, INSTRUCTIONS_REQUIRED_CREATE, INSTRUCTIONS_REQUIRED_EDIT } from "./instructionsRule";

const withPdf = { ...emptyDraft(), pdf: { key: "k", name: "a.pdf", blob: new Blob(["x"]) } };

describe("instructionsProblem", () => {
  it("create needs text, even with a file", () => {
    expect(instructionsProblem("create", "", emptyDraft())).toBe(INSTRUCTIONS_REQUIRED_CREATE);
    expect(instructionsProblem("create", "   ", withPdf)).toBe(INSTRUCTIONS_REQUIRED_CREATE);
    expect(instructionsProblem("create", "Build an app", emptyDraft())).toBeNull();
  });

  it("edit accepts text or a remaining file (old file-only projects keep working)", () => {
    expect(instructionsProblem("edit", "", emptyDraft())).toBe(INSTRUCTIONS_REQUIRED_EDIT);
    expect(instructionsProblem("edit", "", withPdf)).toBeNull();
    expect(instructionsProblem("edit", "Build an app", emptyDraft())).toBeNull();
  });
});
