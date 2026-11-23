import { readDocumentStructure, type DocBlock } from "../collab/documentExport.js";

// Heading texts of a group's document, for the task "linked heading" picker. Read-only: it decodes
// the persisted Document.yjsState (or the legacy content) into a scratch Y.Doc via
// readDocumentStructure - the same helper the .docx export uses - and never touches the live
// collaboration room, so it cannot create a Yjs update, EditEvent or EditSession.

export interface DocHeading {
  level: 1 | 2;
  text: string;
}

function collect(blocks: DocBlock[], out: DocHeading[]): void {
  for (const b of blocks) {
    if (b.kind === "heading") {
      // Same set as the editor's table of contents (computeHeadings): H1 and H2, trimmed text.
      const text = b.runs.map((r) => r.text).join("").trim();
      if ((b.level === 1 || b.level === 2) && text) out.push({ level: b.level, text });
    } else if (b.kind === "listItem" || b.kind === "taskItem") {
      collect(b.blocks, out);
    } else if (b.kind === "table") {
      for (const row of b.rows) for (const cell of row.cells) collect(cell.blocks, out);
    }
  }
}

export function extractHeadings(doc: { content: string; yjsState: Uint8Array | null }): DocHeading[] {
  const out: DocHeading[] = [];
  collect(readDocumentStructure(doc), out);
  return out;
}
