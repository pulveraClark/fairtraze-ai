interface ProjectOption {
  id: number;
  name: string;
  repoUrl: string;
}

interface Props {
  projects: ProjectOption[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAnalyze: () => void;
  loading: boolean;
}

export function ProjectSelector({ projects, selectedId, onSelect, onAnalyze, loading }: Props) {
  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="flex-1 min-w-48">
        <label htmlFor="project-select" className="block text-xs font-medium text-slate-500 mb-1">
          Project
        </label>
        <select
          id="project-select"
          value={selectedId ?? ""}
          onChange={(e) => onSelect(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="" disabled>
            Select a project…
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={onAnalyze}
        disabled={selectedId === null || loading}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            Analyzing…
          </>
        ) : (
          "Analyze"
        )}
      </button>
    </div>
  );
}
