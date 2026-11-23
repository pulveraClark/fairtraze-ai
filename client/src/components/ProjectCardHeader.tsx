import type { MouseEvent } from "react";

interface Props {
  /** GITHUB | EDITOR | COMBINED */
  sourceType: string;
  title: string;
  /** "1 group needs attention", or null when nothing needs a look. */
  attentionLabel: string | null;
  /** Omit for people who cannot delete (no button, same space kept). */
  onDelete?: (e: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Coloured band of a project card on the class page. One layout for every source type, so cards in a grid row
 * have the same header height and the same positions:
 *   row 1: icon + source badge (left), delete button (always the top-right corner, 32px box)
 *   row 2: attention chip (the row keeps its height when there is no chip)
 *   row 3: title (room for two lines)
 * The parent sets the background colour; text is white.
 */
export function ProjectCardHeader({ sourceType, title, attentionLabel, onDelete }: Props) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="project-card-header">
      <div className="flex h-8 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/20" aria-hidden="true">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="whitespace-nowrap rounded border border-white/30 bg-white/20 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
            {sourceType}
          </span>
        </div>
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            title="Delete project"
            aria-label={`Delete project ${title}`}
            className="ft-hit shrink-0 rounded text-white/80 transition-colors hover:bg-red-500/40 hover:text-white"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        ) : (
          <span className="h-8 w-8 shrink-0" aria-hidden="true" />
        )}
      </div>
      <div className="flex min-h-6 items-center">
        {attentionLabel && (
          <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/30 bg-white/25 px-2 py-0.5 text-xs font-semibold text-white">
            <span aria-hidden="true">⚠</span>
            <span className="truncate">{attentionLabel}</span>
          </span>
        )}
      </div>
      <p className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-white">{title}</p>
    </div>
  );
}
