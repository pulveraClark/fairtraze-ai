import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface ToastOptions {
  message: string;
  /** "error" toasts use role="alert" and stay longer. "info" is neutral (no check, no error style). Default "success". */
  tone?: "success" | "error" | "info";
  /** An action button (e.g. Undo). A toast with an action stays longer so it can be reached. */
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
  tone: "success" | "error" | "info";
  durationMs: number;
}

interface ToastContextValue {
  showSuccessToast: (message: string) => void;
  showError: (message: string) => void;
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const TOAST_DURATION_MS = 4000;
export const ERROR_DURATION_MS = 8000;
export const ACTION_DURATION_MS = 8000;
export const MAX_VISIBLE_TOASTS = 3;

/** Errors and toasts with an action (Undo) are protected: a newer success toast never pushes them out. */
function isProtected(t: { tone: string; actionLabel?: string }): boolean {
  return t.tone === "error" || !!t.actionLabel;
}

/**
 * Global feedback: one small column, at most MAX_VISIBLE_TOASTS at once.
 * - An identical message that is already showing is merged (its timer restarts; no duplicate).
 * - When the column is full the oldest success/info toast leaves first. Errors and Undo toasts are
 *   kept; a new success toast is only dropped when every visible toast is protected.
 * - Hovering or focusing a toast pauses its own timer, so the Undo or Close button can be reached.
 * - Position: top of the screen on phones (clear of bottom buttons and the keyboard), bottom-right
 *   from the `sm` breakpoint up.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  // A ref mirror so several toasts raised in the same tick are all seen by the next call.
  const toastsRef = useRef<ToastState[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const idRef = useRef(0);

  const commit = useCallback((next: ToastState[]) => {
    toastsRef.current = next;
    setToasts(next);
  }, []);

  const cancel = useCallback((id: number) => {
    const handle = timers.current.get(id);
    if (handle) clearTimeout(handle);
    timers.current.delete(id);
  }, []);

  const dismiss = useCallback((id: number) => {
    cancel(id);
    commit(toastsRef.current.filter((t) => t.id !== id));
  }, [cancel, commit]);

  const schedule = useCallback((id: number, ms: number) => {
    cancel(id);
    timers.current.set(id, setTimeout(() => dismiss(id), ms));
  }, [cancel, dismiss]);

  const showToast = useCallback((options: ToastOptions) => {
    const tone = options.tone ?? "success";
    const durationMs = options.durationMs
      ?? (options.actionLabel ? ACTION_DURATION_MS : tone === "error" ? ERROR_DURATION_MS : TOAST_DURATION_MS);
    const current = toastsRef.current;
    const existing = current.find((t) => t.message === options.message && t.tone === tone);

    let id: number;
    let next: ToastState[];
    if (existing) {
      id = existing.id;
      next = current.map((t) => (t.id === id ? { ...t, ...options, id, tone, durationMs } : t));
    } else {
      id = ++idRef.current;
      const fresh: ToastState = { ...options, id, tone, durationMs };
      next = [...current, fresh];
      if (next.length > MAX_VISIBLE_TOASTS) {
        const evict = next.findIndex((t, i) => i < next.length - 1 && !isProtected(t));
        if (evict >= 0) next.splice(evict, 1);
        else if (isProtected(fresh)) next.shift();
        else next.pop(); // every visible toast is protected: the new success is the one that gives way
      }
    }
    commit(next);
    // Drop timers of toasts that were pushed out.
    for (const key of [...timers.current.keys()]) {
      if (!next.some((t) => t.id === key)) cancel(key);
    }
    if (next.some((t) => t.id === id)) schedule(id, durationMs);
  }, [cancel, commit, schedule]);

  const showSuccessToast = useCallback((message: string) => showToast({ message }), [showToast]);
  const showError = useCallback((message: string) => showToast({ message, tone: "error" }), [showToast]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const handle of map.values()) clearTimeout(handle);
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ showSuccessToast, showError, showToast }), [showSuccessToast, showError, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        data-toast-region
        className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:top-auto sm:items-end"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onClose={() => dismiss(toast.id)}
            onPause={() => cancel(toast.id)}
            onResume={() => schedule(toast.id, toast.durationMs)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onClose,
  onPause,
  onResume,
}: {
  toast: ToastState;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const isError = toast.tone === "error";
  const isInfo = toast.tone === "info";
  return (
    <div
      role={isError ? "alert" : "status"}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onResume();
      }}
      className={`pointer-events-auto flex w-full max-w-[22rem] items-center gap-2.5 rounded-xl border bg-white px-3 py-2 text-sm text-slate-700 shadow-lg animate-toast-in ${
        isError ? "border-red-300" : isInfo ? "border-slate-300" : "border-emerald-200"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${isError ? "bg-red-100" : isInfo ? "bg-slate-100" : "bg-emerald-100"}`}
      >
        {isInfo ? (
          <svg className="h-3 w-3 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v5m0-8.5v.01" />
          </svg>
        ) : isError ? (
          <svg className="h-3 w-3 text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5m0 3.5v.01" />
          </svg>
        ) : (
          <svg className="h-3 w-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1 break-words font-medium">{toast.message}</span>
      {toast.actionLabel && (
        <button
          type="button"
          onClick={() => {
            onClose();
            toast.onAction?.();
          }}
          className="min-h-8 shrink-0 rounded-md px-2.5 text-sm font-semibold text-indigo-800 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
