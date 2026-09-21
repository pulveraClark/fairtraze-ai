import type { ReactNode } from "react";

// Mirrors server/src/collab/documentExport.ts's DocBlock/TextRun exactly — those types aren't
// exported through shared/src, so this is a deliberate local mirror of the server's contract (see
// the document revision-history design notes). Keep in sync if documentExport.ts's shape changes.
export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  color?: string;
  highlight?: string;
}

export type DocBlock =
  | { kind: "heading"; level: number; align?: string; runs: TextRun[] }
  | { kind: "paragraph"; align?: string; runs: TextRun[] }
  | { kind: "listItem"; listType: "bulletList" | "orderedList"; blocks: DocBlock[] }
  | { kind: "table"; rows: { cells: { header: boolean; blocks: DocBlock[] }[] }[] };

const HEADING_SIZES: Record<number, string> = {
  1: "text-2xl font-bold",
  2: "text-xl font-bold",
  3: "text-lg font-semibold",
  4: "text-base font-semibold",
  5: "text-sm font-semibold",
  6: "text-sm font-semibold text-slate-600",
};

function alignClass(align?: string): string {
  switch (align) {
    case "center":
      return "text-center";
    case "right":
      return "text-right";
    case "justify":
      return "text-justify";
    default:
      return "";
  }
}

function TextRunSpan({ run, index }: { run: TextRun; index: number }) {
  const decorations = [run.underline && "underline", run.strike && "line-through"].filter(Boolean).join(" ");
  return (
    <span
      key={index}
      className={[run.bold && "font-bold", run.italic && "italic"].filter(Boolean).join(" ")}
      style={{
        textDecorationLine: decorations || undefined,
        color: run.color || undefined,
        backgroundColor: run.highlight || undefined,
      }}
    >
      {run.text}
    </span>
  );
}

function Runs({ runs }: { runs: TextRun[] }) {
  if (runs.length === 0) return null;
  return (
    <>
      {runs.map((run, i) => (
        <TextRunSpan key={i} run={run} index={i} />
      ))}
    </>
  );
}

type ListItemBlock = Extract<DocBlock, { kind: "listItem" }>;

// DocBlock has no explicit "list" wrapper — sibling listItem blocks share a listType and must be
// grouped into a single <ul>/<ol> for valid, correctly nested HTML (mirrors how
// documentExport.ts's docx side handles the same flat shape per-paragraph, just for HTML instead).
function renderBlockList(blocks: DocBlock[], keyPrefix = ""): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.kind === "listItem") {
      const listType = block.listType;
      const items: ListItemBlock[] = [];
      while (i < blocks.length) {
        const next = blocks[i];
        if (next.kind !== "listItem" || next.listType !== listType) break;
        items.push(next);
        i++;
      }
      const ListTag = listType === "orderedList" ? "ol" : "ul";
      nodes.push(
        <ListTag
          key={`${keyPrefix}list-${i}`}
          className={listType === "orderedList" ? "list-decimal pl-6 space-y-1" : "list-disc pl-6 space-y-1"}
        >
          {items.map((item, idx) => (
            <li key={idx}>{renderBlockList(item.blocks, `${keyPrefix}li${idx}-`)}</li>
          ))}
        </ListTag>
      );
    } else {
      nodes.push(<DocBlockNode key={`${keyPrefix}b-${i}`} block={block} />);
      i++;
    }
  }
  return nodes;
}

function DocBlockNode({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "heading": {
      const level = Math.min(Math.max(block.level, 1), 6);
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag className={`${HEADING_SIZES[level]} ${alignClass(block.align)} mt-4 mb-2`}>
          <Runs runs={block.runs} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className={`${alignClass(block.align)} text-sm text-slate-700 leading-relaxed mb-2`}>
          <Runs runs={block.runs} />
        </p>
      );
    case "listItem":
      // Reached only for a standalone listItem not grouped by renderBlockList (shouldn't normally
      // happen at the top level, but stay correct if it does).
      return <>{renderBlockList([block])}</>;
    case "table":
      return (
        <table className="w-full border-collapse border border-slate-200 my-3 text-sm">
          <tbody>
            {block.rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.cells.map((cell, cellIdx) => {
                  const CellTag = cell.header ? "th" : "td";
                  return (
                    <CellTag
                      key={cellIdx}
                      className={`border border-slate-200 px-3 py-2 text-left align-top ${
                        cell.header ? "bg-slate-50 font-semibold" : ""
                      }`}
                    >
                      {renderBlockList(cell.blocks)}
                    </CellTag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

// Pure, presentational renderer for a reconstructed document snapshot (or, in principle, any
// DocBlock[]). Deliberately has no inputs, event handlers that mutate state, or contentEditable
// anywhere — there is no editing capability to disable because none exists.
export function DocBlockRenderer({ blocks }: { blocks: DocBlock[] }) {
  if (blocks.length === 0) {
    return <p className="text-sm text-slate-400 italic">This snapshot has no content.</p>;
  }
  return <div>{renderBlockList(blocks)}</div>;
}
