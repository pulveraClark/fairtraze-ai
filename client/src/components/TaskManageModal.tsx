import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

// Leader/instructor-assigned checklist item. Purely informational — completion
// never affects contribution scores (see server/src/routes/groups.ts Task routes).
export interface GroupTask {
  id: number;
  projectId: number;
  title: string;
  description: string | null;
  assignedToUserId: number | null;
  createdByUserId: number;
  done: boolean;
  completedAt: string | null;
  createdAt: string;
}

interface GroupMemberLite {
  userId: number;
  name: string;
  role: "LEADER" | "MEMBER";
}

interface GroupLite {
  id: number;
  groupName: string;
  members: GroupMemberLite[];
}

interface Props {
  projectId: number;
  isInstructor: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export function TaskManageModal({ projectId, isInstructor, onClose, onChanged }: Props) {
  const { user, token } = useAuth();

  const [group, setGroup]       = useState<GroupLite | null>(null);
  const [loading, setLoading]   = useState(true);
  const [fetchErr, setFetchErr] = useState("");

  const [tasks, setTasks]             = useState<GroupTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksErr, setTasksErr]       = useState("");
  const [taskBusy, setTaskBusy]       = useState<number | null>(null);
  const [newTaskTitle, setNewTaskTitle]         = useState("");
  const [newTaskAssignee, setNewTaskAssignee]   = useState<number | "">("");
  const [createTaskBusy, setCreateTaskBusy]     = useState(false);
  const [createTaskErr, setCreateTaskErr]       = useState("");

  // Tracks whether any task action actually succeeded, so onChanged only
  // fires on real changes, not on every close.
  const [dirty, setDirty] = useState(false);

  const currentUserId = user?.id ?? 0;

  async function fetchGroup() {
    setLoading(true);
    setFetchErr("");
    try {
      const res  = await fetch(`/api/groups/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { error?: string } & Partial<GroupLite>;
      if (!res.ok) { setFetchErr(data.error ?? "Could not load group."); return; }
      setGroup(data as GroupLite);
    } catch {
      setFetchErr("Network error — could not load group.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchTasks() {
    setTasksLoading(true);
    setTasksErr("");
    try {
      const res  = await fetch(`/api/groups/${projectId}/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { tasks?: GroupTask[]; error?: string };
      if (!res.ok) { setTasksErr(data.error ?? "Could not load tasks."); return; }
      setTasks(data.tasks ?? []);
    } catch {
      setTasksErr("Network error — could not load tasks.");
    } finally {
      setTasksLoading(false);
    }
  }

  useEffect(() => {
    void fetchGroup();
    void fetchTasks();
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") handleClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myMembership = group?.members.find((m) => m.userId === currentUserId);
  const amLeader     = myMembership?.role === "LEADER";
  const canManage    = isInstructor || amLeader;

  function handleClose() {
    if (dirty) onChanged?.();
    onClose();
  }

  // ── Tasks (leader/instructor create+manage; assignee toggles their own) ───
  async function handleCreateTask() {
    const title = newTaskTitle.trim();
    if (!title) { setCreateTaskErr("Task title is required."); return; }
    setCreateTaskBusy(true);
    setCreateTaskErr("");
    try {
      const res  = await fetch(`/api/groups/${projectId}/tasks`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ title, assignedToUserId: newTaskAssignee === "" ? undefined : newTaskAssignee }),
      });
      const data = await res.json() as GroupTask & { error?: string };
      if (!res.ok) { setCreateTaskErr(data.error ?? "Could not create task."); return; }
      setTasks((prev) => [...prev, data]);
      setNewTaskTitle("");
      setNewTaskAssignee("");
      setDirty(true);
    } catch {
      setCreateTaskErr("Network error — could not create task.");
    } finally {
      setCreateTaskBusy(false);
    }
  }

  async function handleToggleTask(task: GroupTask) {
    setTaskBusy(task.id);
    const prevTasks = tasks;
    // Optimistic update
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, done: !t.done } : t));
    try {
      const res  = await fetch(`/api/groups/${projectId}/tasks/${task.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ done: !task.done }),
      });
      const data = await res.json() as GroupTask & { error?: string };
      if (!res.ok) { setTasks(prevTasks); setTasksErr(data.error ?? "Could not update task."); return; }
      setTasks((prev) => prev.map((t) => t.id === task.id ? data : t));
      setDirty(true);
    } catch {
      setTasks(prevTasks);
      setTasksErr("Network error — could not update task.");
    } finally {
      setTaskBusy(null);
    }
  }

  async function handleDeleteTask(taskId: number) {
    setTaskBusy(taskId);
    try {
      const res  = await fetch(`/api/groups/${projectId}/tasks/${taskId}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setTasksErr(data.error ?? "Could not delete task."); return; }
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setDirty(true);
    } catch {
      setTasksErr("Network error — could not delete task.");
    } finally {
      setTaskBusy(null);
    }
  }

  function renderBody() {
    if (!group) return null;
    return (
      <>
        <p className="text-xs text-slate-400 mb-3">
          Context only — task completion never affects contribution scores.
        </p>

        {tasksErr && (
          <p className="text-[11px] text-red-500 mb-2">{tasksErr}</p>
        )}

        {tasksLoading ? (
          <p className="text-[11px] text-slate-400">Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic mb-2">No tasks yet.</p>
        ) : (
          <ul className="space-y-2 mb-3">
            {tasks.map((t) => {
              const assignee  = group.members.find((m) => m.userId === t.assignedToUserId);
              const canToggle = canManage || t.assignedToUserId === currentUserId;
              return (
                <li
                  key={t.id}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border ${
                    t.done ? "border-violet-100 bg-violet-50" : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={t.done}
                    disabled={!canToggle || taskBusy === t.id}
                    onChange={() => void handleToggleTask(t)}
                    className="mt-0.5 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${t.done ? "text-slate-500 line-through" : "text-slate-800"}`}>
                      {t.title}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {assignee ? assignee.name : "Unassigned"}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => void handleDeleteTask(t.id)}
                      disabled={taskBusy === t.id}
                      className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0"
                    >
                      Delete
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canManage && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="New task title…"
              className="flex-1 min-w-0 text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
            />
            <select
              value={newTaskAssignee}
              onChange={(e) => setNewTaskAssignee(e.target.value ? Number(e.target.value) : "")}
              className="text-xs rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 cursor-pointer"
            >
              <option value="">Unassigned</option>
              {group.members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name}</option>
              ))}
            </select>
            <button
              onClick={() => void handleCreateTask()}
              disabled={createTaskBusy}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2.5 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors disabled:opacity-50 shrink-0"
            >
              Add
            </button>
          </div>
        )}
        {createTaskErr && (
          <p className="text-[11px] text-red-500 mt-1.5">{createTaskErr}</p>
        )}
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Tasks</h2>
            {group && (
              <p className="text-xs text-slate-400 mt-0.5">{group.groupName}</p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {loading && (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-slate-400">
              <span className="h-4 w-4 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
              Loading…
            </div>
          )}

          {!loading && fetchErr && (
            <p className="text-sm text-red-600 py-4 text-center">{fetchErr}</p>
          )}

          {!loading && !fetchErr && group && renderBody()}
        </div>
      </div>
    </div>
  );
}
