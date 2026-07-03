interface Props {
  page:       number;
  totalPages: number;
  total:      number;
  pageSize:   number;
  onPage:     (p: number) => void;
  label?:     string;
  dark?:      boolean;
}

export function PaginationBar({ page, totalPages, total, pageSize, onPage, label = "items", dark = false }: Props) {
  if (totalPages <= 1) return null;

  const start = Math.min((page - 1) * pageSize + 1, total);
  const end   = Math.min(page * pageSize, total);

  const base   = "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors";
  const btnOn  = dark
    ? `${base} border-slate-700 text-slate-300 hover:border-indigo-400 hover:text-indigo-400 bg-slate-800/50`
    : `${base} border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 bg-white`;
  const btnOff = dark
    ? `${base} border-slate-800 text-slate-600 bg-transparent cursor-not-allowed`
    : `${base} border-slate-100 text-slate-300 bg-white cursor-not-allowed`;

  return (
    <div className={`flex items-center justify-between gap-4 px-1 pt-3 mt-1 border-t ${dark ? "border-slate-800" : "border-slate-100"}`}>
      <p className={`text-xs ${dark ? "text-slate-500" : "text-slate-400"}`}>
        {start}–{end} of {total} {label}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className={page <= 1 ? btnOff : btnOn}
        >
          ← Prev
        </button>
        <span className={`text-xs font-medium ${dark ? "text-slate-400" : "text-slate-600"} px-2 min-w-[84px] text-center`}>
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className={page >= totalPages ? btnOff : btnOn}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
