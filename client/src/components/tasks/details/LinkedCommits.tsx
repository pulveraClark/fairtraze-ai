import type { BoardTask, TaskCommitView } from "@shared/taskTypes";
import { formatWhen } from "../../../lib/tasks/activityText";
import { FOCUS_LIGHT } from "../../ui/styles";
import { CommitIcon } from "../icons";

interface Props {
  task: BoardTask;
  commits: TaskCommitView[];
  /** The group has a GitHub repository (an editor-only group has nothing to link). */
  hasRepo: boolean;
}

/**
 * Commits in the group's repo whose message names this task (for example "FT-12: fix the login form").
 * Read-only, display only: linking never changes a contribution score.
 */
export function LinkedCommits({ task, commits, hasRepo }: Props) {
  return (
    <section aria-labelledby={`commits-${task.id}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`commits-${task.id}`} className="text-sm font-semibold text-slate-900">Linked commits</h3>
        <span className="text-xs tabular-nums text-slate-700">{commits.length}</span>
      </div>

      {commits.length === 0 && (
        <p className="mt-2 text-sm text-slate-700">
          {hasRepo
            ? <>No commits linked yet. Put <span className="font-semibold text-slate-900">{task.key}</span> in a commit message; it links the next time the leader refreshes commits or an analysis runs.</>
            : "This group has no GitHub repository, so commits are not linked."}
        </p>
      )}

      <ul className="mt-2 space-y-1.5">
        {commits.map((c) => (
          <li key={c.sha} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <CommitIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm text-slate-900">{c.message}</p>
              <p className="text-xs text-slate-700">
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Commit ${c.shortSha} on GitHub (opens in a new tab)`}
                    className={`rounded font-mono font-semibold text-indigo-900 underline ${FOCUS_LIGHT}`}
                  >
                    {c.shortSha}
                  </a>
                ) : (
                  <span className="font-mono font-semibold text-slate-900">{c.shortSha}</span>
                )}
                {c.authorLogin ? ` · ${c.authorLogin}` : ""} · {formatWhen(c.committedAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
