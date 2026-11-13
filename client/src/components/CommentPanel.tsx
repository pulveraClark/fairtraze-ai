import { useRef, useState } from "react";
import { getUserColor } from "../lib/collabColors";
import { FOCUS_LIGHT } from "./ui/styles";

// Real buttons need an explicit pointer cursor (the Tailwind reset removes it), a hover and focus style, and a 32px target.
const ACTION = `inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center rounded-md px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_LIGHT}`;

export interface CommentAuthor {
  id: number;
  name: string;
}

export interface CommentRecord {
  id: number;
  documentId: number;
  author: CommentAuthor;
  text: string;
  anchor: string;
  parentId: number | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface PendingSelection {
  from: number;
  to: number;
}

interface Props {
  comments: CommentRecord[];
  currentUserId: number;
  memberIds: number[];
  canModerate: boolean; // instructor — may delete any comment, matches isInstructorOf server-side
  pendingSelection: PendingSelection | null;
  onCancelPending: () => void;
  onSubmitNew: (text: string) => Promise<void>;
  onReply: (parentId: number, text: string) => Promise<void>;
  onResolveToggle: (commentId: number, resolved: boolean) => Promise<void>;
  onDelete: (commentId: number) => Promise<void>;
  onSelectThread: (commentId: number) => void;
  activeThreadId: number | null;
}

function Avatar({ author, memberIds }: { author: CommentAuthor; memberIds: number[] }) {
  const initial = author.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
      style={{ backgroundColor: getUserColor(author.id, memberIds) }}
    >
      {initial}
    </span>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

function ComposeBox({
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (text: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setText("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
      />
      <div className="flex items-center gap-2 mt-1.5">
        <button
          type="button"
          disabled={!text.trim() || submitting}
          onClick={handleSubmit}
          className={`${ACTION} bg-indigo-700 px-3 font-semibold text-white hover:bg-indigo-800`}
        >
          {submitting ? "Posting…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className={`${ACTION} text-slate-700 hover:bg-slate-100 hover:text-slate-900`}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Thread({
  root,
  replies,
  currentUserId,
  canModerate,
  active,
  memberIds,
  onReply,
  onResolveToggle,
  onDelete,
  onSelect,
}: {
  root: CommentRecord;
  replies: CommentRecord[];
  currentUserId: number;
  canModerate: boolean;
  active: boolean;
  memberIds: number[];
  onReply: (parentId: number, text: string) => Promise<void>;
  onResolveToggle: (commentId: number, resolved: boolean) => Promise<void>;
  onDelete: (commentId: number) => Promise<void>;
  onSelect: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // A ref blocks a second click in the same tick, before React has re-rendered the disabled button.
  const busyRef = useRef(false);
  const resolved = !!root.resolvedAt;

  const run = async (start: () => void, task: () => Promise<void>, end: () => void) => {
    if (busyRef.current) return;
    busyRef.current = true;
    start();
    try {
      await task();
    } catch {
      // The parent reports the failure; the button just comes back.
    } finally {
      busyRef.current = false;
      end();
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
        active
          ? "border-indigo-300 bg-indigo-50/50"
          : resolved
            ? "border-slate-100 bg-slate-50/60 opacity-70"
            : "border-slate-200 bg-white hover:border-indigo-200"
      }`}
    >
      {[root, ...replies].map((c, i) => (
        <div key={c.id} className={i > 0 ? "mt-2.5 pt-2.5 border-t border-slate-100 pl-3" : ""}>
          <div className="flex items-start gap-2">
            <Avatar author={c.author} memberIds={memberIds} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-slate-700">{c.author.name}</span>
                <span className="text-xs text-slate-600">{timeAgo(c.createdAt)}</span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap break-words">{c.text}</p>
            </div>
            {(c.author.id === currentUserId || canModerate) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void run(() => setDeletingId(c.id), () => onDelete(c.id), () => setDeletingId(null));
                }}
                disabled={deletingId !== null}
                aria-busy={deletingId === c.id}
                className={`${ACTION} shrink-0 text-slate-600 hover:bg-red-50 hover:text-red-700`}
                aria-label={deletingId === c.id ? "Deleting comment" : "Delete comment"}
              >
                {deletingId === c.id ? "…" : "✕"}
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-1 mt-2.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setReplying((v) => !v)}
          disabled={resolving}
          aria-expanded={replying}
          className={`${ACTION} text-slate-700 hover:bg-indigo-50 hover:text-indigo-800`}
        >
          Reply
        </button>
        <button
          type="button"
          onClick={() => void run(() => setResolving(true), () => onResolveToggle(root.id, !resolved), () => setResolving(false))}
          disabled={resolving}
          aria-busy={resolving}
          className={`${ACTION} ${resolved ? "text-slate-700 hover:bg-slate-100 hover:text-slate-900" : "text-emerald-800 hover:bg-emerald-50"}`}
        >
          {resolving ? (resolved ? "Reopening…" : "Resolving…") : resolved ? "Reopen" : "Resolve"}
        </button>
      </div>

      {replying && (
        <div onClick={(e) => e.stopPropagation()}>
          <ComposeBox
            placeholder="Reply…"
            submitLabel="Reply"
            onCancel={() => setReplying(false)}
            onSubmit={async (text) => {
              await onReply(root.id, text);
              setReplying(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function CommentPanel({
  comments,
  currentUserId,
  memberIds,
  canModerate,
  pendingSelection,
  onCancelPending,
  onSubmitNew,
  onReply,
  onResolveToggle,
  onDelete,
  onSelectThread,
  activeThreadId,
}: Props) {
  const roots = comments.filter((c) => c.parentId === null);
  const repliesByParent = new Map<number, CommentRecord[]>();
  for (const c of comments) {
    if (c.parentId === null) continue;
    const list = repliesByParent.get(c.parentId) ?? [];
    list.push(c);
    repliesByParent.set(c.parentId, list);
  }

  return (
    <div className="w-full md:w-72 shrink-0 border-t md:border-t-0 md:border-l border-slate-100 bg-slate-50/40 flex flex-col max-h-[32rem]">
      <div className="px-3 py-2 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Comments</h4>
      </div>

      {pendingSelection && (
        <div className="px-3 pt-3">
          <p className="text-xs text-slate-600 mb-1">New comment on selected text</p>
          <ComposeBox
            placeholder="Add a comment…"
            submitLabel="Comment"
            onCancel={onCancelPending}
            onSubmit={onSubmitNew}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {roots.length === 0 && !pendingSelection && (
          <p className="text-xs text-slate-600 text-center py-6">
            No comments yet. Select some text to add one.
          </p>
        )}
        {roots.map((root) => (
          <Thread
            key={root.id}
            root={root}
            replies={repliesByParent.get(root.id) ?? []}
            currentUserId={currentUserId}
            canModerate={canModerate}
            active={activeThreadId === root.id}
            memberIds={memberIds}
            onReply={onReply}
            onResolveToggle={onResolveToggle}
            onDelete={onDelete}
            onSelect={() => onSelectThread(root.id)}
          />
        ))}
      </div>
    </div>
  );
}
