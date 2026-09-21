export interface TocHeading {
  pos: number;
  level: number; // 1 or 2 (H1/H2)
  text: string;
}

interface Props {
  headings: TocHeading[];
  onSelect: (pos: number) => void;
}

// Pure client-side, derived from the editor's current state — no new data model, no backend.
// Mirrors CommentPanel.tsx's sidebar shell so both panels feel like the same UI surface.
export function TocPanel({ headings, onSelect }: Props) {
  return (
    <div className="w-72 shrink-0 border-l border-slate-100 bg-slate-50/40 flex flex-col max-h-[32rem]">
      <div className="px-3 py-2 border-b border-slate-100">
        <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Contents</h4>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {headings.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">
            No headings yet. Use Heading 1 or Heading 2 to build a table of contents.
          </p>
        )}
        {headings.map((h) => (
          <button
            key={h.pos}
            type="button"
            onClick={() => onSelect(h.pos)}
            className={`w-full text-left text-xs text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded px-2 py-1.5 truncate ${
              h.level === 2 ? "pl-5" : "font-medium"
            }`}
            title={h.text}
          >
            {h.text || "(Untitled heading)"}
          </button>
        ))}
      </div>
    </div>
  );
}
