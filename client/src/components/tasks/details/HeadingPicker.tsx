import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../context/AuthContext";
import { groupKeys } from "../../../hooks/useGroupQueries";
import { taskApi } from "../../../lib/tasks/api";
import { FOCUS_LIGHT } from "../../ui/styles";

interface Props {
  projectId: number;
  /** The heading text currently linked, or null. */
  current: string | null;
  id: string;
  /** Called with the chosen heading text, or null to remove the link. */
  onSelect: (heading: string | null) => void;
  disabled?: boolean;
  describedBy?: string;
}

/**
 * Pick one of the document's headings (Heading 1 and 2) for a task. The list comes from the saved
 * copy of the document on the server (read-only), so it works without opening the Document tab and
 * a task can be linked to a heading before the editor is ever opened.
 */
export function HeadingPicker({ projectId, current, id, onSelect, disabled, describedBy }: Props) {
  const { token, user } = useAuth();
  const query = useQuery({
    queryKey: groupKeys.docHeadings(user?.id ?? null, projectId),
    queryFn: () => taskApi.documentHeadings(token, projectId),
    enabled: !!token,
    retry: false,
    staleTime: 15_000,
  });
  const headings = query.data?.headings ?? [];
  const missing = current !== null && !headings.some((h) => h.text === current);

  return (
    <div>
      <label htmlFor={id} className="sr-only">Linked document heading</label>
      <select
        id={id}
        value={current ?? ""}
        disabled={disabled || query.isLoading}
        aria-describedby={describedBy}
        onChange={(e) => onSelect(e.target.value || null)}
        className={`min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-700 ${FOCUS_LIGHT}`}
      >
        <option value="">{query.isLoading ? "Loading headings…" : "No linked heading"}</option>
        {missing && <option value={current!}>{current} (not found in the document)</option>}
        {headings.map((h, i) => (
          <option key={`${i}:${h.text}`} value={h.text}>{h.level === 2 ? "– " : ""}{h.text}</option>
        ))}
      </select>
      {query.isError && <p className="mt-1 text-xs font-medium text-red-800">Could not load the document's headings.</p>}
      {!query.isLoading && !query.isError && headings.length === 0 && (
        <p className="mt-1 text-xs text-slate-700">No headings yet. Add a Heading 1 or Heading 2 in the Document tab.</p>
      )}
    </div>
  );
}
