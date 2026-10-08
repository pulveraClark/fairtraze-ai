// Pre-built starting structures for a group's FairTraze Docs document. Each template's
// `content` is a literal TipTap/ProseMirror JSON document, built only from the node types
// `legacySchema` in server/src/collab/persistence.ts already supports (paragraph, heading,
// bulletList/orderedList/listItem, text) — no images/tables, matching that schema's node set.
//
// Templates are only ever applied at document-creation time, before any collaboration room has
// been bound (see server/src/routes/documents.ts POST /document/init). This lets
// persistence.ts's existing no-origin legacy-content migration path seed the boilerplate, so it
// never produces an EditEvent/EditSession row and never counts toward any member's score — the
// same reason the current default empty-paragraph document is invisible to scoring today.

export interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  text?: string;
}

export interface ProseMirrorDoc {
  type: "doc";
  content: ProseMirrorNode[];
}

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  content: ProseMirrorDoc;
}

function heading(level: 1 | 2, text: string): ProseMirrorNode {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

function paragraph(text = ""): ProseMirrorNode {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}

function bulletList(items: string[]): ProseMirrorNode {
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraph(item)],
    })),
  };
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "case-study",
    name: "Case Study",
    description: "Background, problem statement, analysis, and recommendations.",
    content: {
      type: "doc",
      content: [
        heading(1, "Case Study Title"),
        paragraph("A short summary of the case and why it matters."),
        heading(2, "Background"),
        paragraph(),
        heading(2, "Problem Statement"),
        paragraph(),
        heading(2, "Analysis"),
        paragraph(),
        heading(2, "Recommendations"),
        bulletList(["Recommendation 1", "Recommendation 2", "Recommendation 3"]),
        heading(2, "Conclusion"),
        paragraph(),
      ],
    },
  },
  {
    id: "business-plan",
    name: "Business Plan",
    description: "Executive summary, market analysis, strategy, and financial overview.",
    content: {
      type: "doc",
      content: [
        heading(1, "Business Plan"),
        heading(2, "Executive Summary"),
        paragraph(),
        heading(2, "Market Analysis"),
        paragraph(),
        heading(2, "Product / Service Description"),
        paragraph(),
        heading(2, "Marketing & Sales Strategy"),
        paragraph(),
        heading(2, "Financial Overview"),
        paragraph(),
        heading(2, "Team & Operations"),
        paragraph(),
      ],
    },
  },
  {
    id: "lab-report",
    name: "Lab Report",
    description: "Objective, materials, procedure, results, and discussion.",
    content: {
      type: "doc",
      content: [
        heading(1, "Lab Report Title"),
        heading(2, "Objective"),
        paragraph(),
        heading(2, "Materials"),
        bulletList(["Material 1", "Material 2"]),
        heading(2, "Procedure"),
        paragraph(),
        heading(2, "Results"),
        paragraph(),
        heading(2, "Discussion"),
        paragraph(),
        heading(2, "Conclusion"),
        paragraph(),
      ],
    },
  },
  {
    id: "research-paper-outline",
    name: "Research Paper Outline",
    description: "Introduction, literature review, methodology, findings, and conclusion.",
    content: {
      type: "doc",
      content: [
        heading(1, "Research Paper Title"),
        heading(2, "Introduction"),
        paragraph(),
        heading(2, "Literature Review"),
        paragraph(),
        heading(2, "Methodology"),
        paragraph(),
        heading(2, "Findings"),
        paragraph(),
        heading(2, "Discussion"),
        paragraph(),
        heading(2, "Conclusion"),
        paragraph(),
        heading(2, "References"),
        paragraph(),
      ],
    },
  },
];

export function findDocumentTemplate(id: string): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find((t) => t.id === id);
}
