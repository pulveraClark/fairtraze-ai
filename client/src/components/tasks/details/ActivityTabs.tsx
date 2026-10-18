import { useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { TASK_LIMITS, type BoardResponse, type BoardTask, type TaskActivityEntry, type TaskCommentView } from "@shared/taskTypes";
import { Avatar } from "../../Avatar";
import { describeActivity, formatWhen } from "../../../lib/tasks/activityText";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT } from "../../ui/styles";
import { MentionText, MentionTextarea, displayFromStored, storedFromDisplay } from "./MentionTextarea";

type Tab = "comments" | "history";

interface Props {
  board: BoardResponse;
  task: BoardTask;
  comments: TaskCommentView[];
  activity: TaskActivityEntry[];
  /** Why commenting is locked (tooltip + text), or null when the viewer may comment. */
  commentLockedReason: string | null;
  onAdd: (body: string) => Promise<unknown>;
  onEdit: (id: number, body: string) => Promise<unknown>;
  onRemove: (id: number) => Promise<unknown>;
  dismissRef: MutableRefObject<(() => void) | null>;
}

/** Comments / History tabs under the task's description. */
export function ActivityTabs({ board, task, comments, activity, commentLockedReason, onAdd, onEdit, onRemove, dismissRef }: Props) {
  const [tab, setTab] = useState<Tab>("comments");
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "comments", label: "Comments", count: comments.length },
    { id: "history", label: "History", count: activity.length },
  ];

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tab === "comments" ? "history" : "comments";
    setTab(next);
    document.getElementById(`task-tab-${task.id}-${next}`)?.focus();
  }

  return (
    <section aria-label="Comments and history">
      <div role="tablist" aria-label="Comments and history" onKeyDown={onKeyDown} className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`task-tab-${task.id}-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`task-panel-${task.id}-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={`-mb-px min-h-10 border-b-2 px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-700 ${
              tab === t.id ? "border-indigo-700 text-indigo-900" : "border-transparent text-slate-700 hover:text-slate-900"
            }`}
          >
            {t.label} <span className="tabular-nums font-normal">({t.count})</span>
          </button>
        ))}
      </div>

      <div id={`task-panel-${task.id}-comments`} role="tabpanel" aria-labelledby={`task-tab-${task.id}-comments`} hidden={tab !== "comments"} className="pt-3">
        {tab === "comments" && (
          <CommentsPanel
            board={board}
            task={task}
            comments={comments}
            lockedReason={commentLockedReason}
            onAdd={onAdd}
            onEdit={onEdit}
            onRemove={onRemove}
            dismissRef={dismissRef}
          />
        )}
      </div>
      <div id={`task-panel-${task.id}-history`} role="tabpanel" aria-labelledby={`task-tab-${task.id}-history`} hidden={tab !== "history"} className="pt-3">
        {tab === "history" && <HistoryPanel board={board} activity={activity} />}
      </div>
    </section>
  );
}

function CommentsPanel({ board, task, comments, lockedReason, onAdd, onEdit, onRemove, dismissRef }: Omit<Props, "activity" | "commentLockedReason"> & { lockedReason: string | null }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const me = board.viewer.userId;
  const locked = lockedReason !== null;

  async function submit() {
    const stored = storedFromDisplay(draft, board.members).trim();
    if (!stored || busy || locked) return;
    if (stored.length > TASK_LIMITS.comment) { setError(`Comments can be up to ${TASK_LIMITS.comment} characters.`); return; }
    setBusy(true);
    setError("");
    const saved = await onAdd(stored);
    setBusy(false);
    if (saved) setDraft("");
  }

  async function saveEdit(id: number) {
    const stored = storedFromDisplay(editDraft, board.members).trim();
    if (!stored) return;
    if (stored.length > TASK_LIMITS.comment) { setError(`Comments can be up to ${TASK_LIMITS.comment} characters.`); return; }
    setError("");
    const saved = await onEdit(id, stored);
    if (saved) setEditingId(null);
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 && <p className="text-sm text-slate-700">No comments yet.</p>}
      <ul className="space-y-3">
        {comments.map((c) => {
          const author = board.members.find((m) => m.userId === c.authorId);
          const mine = c.authorId === me;
          return (
            <li key={c.id} className="flex gap-2">
              <Avatar
                userId={c.authorId}
                name={author?.name ?? "Former member"}
                avatarUpdatedAt={author?.avatarUpdatedAt}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-900"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-900">
                  <span className="font-semibold">{author?.name ?? "A former member"}</span>
                  <span className="ml-2 text-xs text-slate-700">{formatWhen(c.createdAt)}{c.editedAt ? " · edited" : ""}</span>
                </p>
                {editingId === c.id ? (
                  <div className="mt-1 space-y-2">
                    <MentionTextarea
                      id={`comment-edit-${c.id}`}
                      label="Edit comment"
                      hideLabel
                      popup="above"
                      value={editDraft}
                      onChange={setEditDraft}
                      members={board.members}
                      maxLength={TASK_LIMITS.comment}
                      dismissRef={dismissRef}
                      onSubmit={() => void saveEdit(c.id)}
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void saveEdit(c.id)} disabled={!editDraft.trim()} className={BUTTON_PRIMARY_COMPACT}>Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className={BUTTON_SECONDARY_COMPACT}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <MentionText text={c.body} members={board.members} className="text-sm text-slate-900" />
                )}
                {mine && editingId !== c.id && (
                  <div className="mt-1 flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => { setEditingId(c.id); setEditDraft(displayFromStored(c.body, board.members)); setConfirmId(null); }}
                      className="min-h-8 rounded text-slate-800 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                    >
                      Edit
                    </button>
                    {confirmId === c.id ? (
                      <span className="flex items-center gap-2" role="alertdialog" aria-label="Confirm delete comment">
                        <span className="font-medium text-slate-900">Delete this comment?</span>
                        <button type="button" onClick={() => { void onRemove(c.id); setConfirmId(null); }} className="min-h-8 rounded font-semibold text-red-800 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800">Delete</button>
                        <button type="button" onClick={() => setConfirmId(null)} className="min-h-8 rounded text-slate-800 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">Keep</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(c.id)}
                        className="min-h-8 rounded text-slate-800 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div title={locked ? lockedReason : undefined}>
        <MentionTextarea
          id={`comment-new-${task.id}`}
          label="Add a comment"
          popup="above"
          value={draft}
          onChange={(v) => { setDraft(v); setError(""); }}
          members={board.members}
          rows={3}
          maxLength={TASK_LIMITS.comment}
          disabled={locked}
          placeholder={locked ? undefined : "Write a comment. Type @ to mention a group member."}
          onSubmit={() => void submit()}
          dismissRef={dismissRef}
          inputRef={composerRef}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs tabular-nums text-slate-700">
            {locked ? lockedReason : `${draft.length} of ${TASK_LIMITS.comment}`}
          </span>
          <button type="button" onClick={() => void submit()} disabled={locked || busy || !draft.trim()} className={BUTTON_PRIMARY_COMPACT}>
            {busy ? "Posting…" : "Comment"}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-red-800">{error}</p>}
    </div>
  );
}

function HistoryPanel({ board, activity }: { board: BoardResponse; activity: TaskActivityEntry[] }) {
  if (activity.length === 0) return <p className="text-sm text-slate-700">No history yet.</p>;
  return (
    <ol aria-label="Task history, newest first" className="space-y-2">
      {activity.map((a) => (
        <li key={a.id} className="text-sm text-slate-900">
          {describeActivity(a, board)}
          <span className="text-slate-700"> · {formatWhen(a.createdAt)}</span>
        </li>
      ))}
    </ol>
  );
}
