import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocBlockRenderer, type DocBlock } from "./DocBlockRenderer";

// This is the one piece of genuinely new logic in the document-history feature: a hand-written
// mapping from server/src/collab/documentExport.ts's DocBlock/TextRun contract to JSX, with no
// existing client-side precedent to lean on (no other component renders DocBlock[] read-only).
// A silent mismatch here (dropped mark, mis-nested list, missing table header) would corrupt
// historical rendering without any server test ever catching it, so this is worth real coverage —
// unlike the panel/page wiring around it, which is thin fetch-then-render orchestration over
// already-tested endpoints and is verified manually instead (see the Step 3 plan notes).

describe("DocBlockRenderer", () => {
  it("renders a heading at the correct level with its text", () => {
    const blocks: DocBlock[] = [{ kind: "heading", level: 2, runs: [{ text: "Section Title" }] }];
    render(<DocBlockRenderer blocks={blocks} />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Section Title");
  });

  it("renders a paragraph with mixed bold/italic/color/highlight runs, preserving run boundaries", () => {
    const blocks: DocBlock[] = [
      {
        kind: "paragraph",
        align: "center",
        runs: [
          { text: "Bold", bold: true },
          { text: " and " },
          { text: "colored", color: "#dc2626", highlight: "#fef08a" },
        ],
      },
    ];
    const { container } = render(<DocBlockRenderer blocks={blocks} />);
    const paragraph = container.querySelector("p");
    expect(paragraph).toHaveTextContent("Bold and colored");
    expect(paragraph?.className).toContain("text-center");

    const spans = container.querySelectorAll("p span");
    expect(spans).toHaveLength(3);
    expect(spans[0].className).toContain("font-bold");
    expect(spans[2]).toHaveStyle({ color: "#dc2626", backgroundColor: "#fef08a" });
  });

  it("renders a table with a header cell distinct from a body cell", () => {
    const blocks: DocBlock[] = [
      {
        kind: "table",
        rows: [
          {
            cells: [
              { header: true, blocks: [{ kind: "paragraph", runs: [{ text: "Header cell" }] }] },
              { header: false, blocks: [{ kind: "paragraph", runs: [{ text: "Body cell" }] }] },
            ],
          },
        ],
      },
    ];
    render(<DocBlockRenderer blocks={blocks} />);
    expect(screen.getByRole("columnheader")).toHaveTextContent("Header cell");
    expect(screen.getByRole("cell")).toHaveTextContent("Body cell");
  });

  it("groups sibling listItem blocks into one correctly-typed list, and renders nested list content", () => {
    const blocks: DocBlock[] = [
      { kind: "listItem", listType: "bulletList", blocks: [{ kind: "paragraph", runs: [{ text: "First" }] }] },
      { kind: "listItem", listType: "bulletList", blocks: [{ kind: "paragraph", runs: [{ text: "Second" }] }] },
      { kind: "listItem", listType: "orderedList", blocks: [{ kind: "paragraph", runs: [{ text: "Third" }] }] },
    ];
    const { container } = render(<DocBlockRenderer blocks={blocks} />);

    const uls = container.querySelectorAll("ul");
    const ols = container.querySelectorAll("ol");
    expect(uls).toHaveLength(1);
    expect(ols).toHaveLength(1);
    expect(uls[0].querySelectorAll("li")).toHaveLength(2);
    expect(ols[0].querySelectorAll("li")).toHaveLength(1);
    expect(uls[0]).toHaveTextContent("First");
    expect(uls[0]).toHaveTextContent("Second");
    expect(ols[0]).toHaveTextContent("Third");
  });

  it("renders a friendly empty state for a snapshot with no content", () => {
    render(<DocBlockRenderer blocks={[]} />);
    expect(screen.getByText(/no content/i)).toBeInTheDocument();
  });

  it("exposes no editable surface — no input, textarea, or contentEditable element anywhere", () => {
    const blocks: DocBlock[] = [
      { kind: "heading", level: 1, runs: [{ text: "Title" }] },
      { kind: "paragraph", runs: [{ text: "Body text." }] },
      {
        kind: "table",
        rows: [{ cells: [{ header: true, blocks: [{ kind: "paragraph", runs: [{ text: "Cell" }] }] }] }],
      },
    ];
    const { container } = render(<DocBlockRenderer blocks={blocks} />);
    expect(container.querySelectorAll("input, textarea, [contenteditable]")).toHaveLength(0);
    expect(container.querySelector('[contenteditable="true"]')).toBeNull();
  });
});
