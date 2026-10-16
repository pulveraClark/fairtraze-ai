import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface ToastOptions {
  message: string;
  /** "error" toasts use role="alert" and stay a little longer. Default "success". */
  tone?: "success" | "error";
  /** An action button (e.g. Undo). A toast with an action stays longer so it can be reached. */
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  showSuccessToast: (message: string) => void;
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 2000;
const ERROR_DURATION_MS = 6000;
const ACTION_DURATION_MS = 8000;

// Global feedback — consistent position (bottom-right), style, and duration across every form in
// the app. One toast at a time; a new one replaces the old. Hovering or focusing a toast pauses its
// timer so the Undo button can always be reached.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef(TOAST_DURATION_MS);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const startTimer = useCallback((ms: number) => {
    clearTimer();
    timerRef.current = setTimeout(() => setToast(null), ms);
  }, [clearTimer]);

  const showToast = useCallback((options: ToastOptions) => {
    const duration = options.durationMs
      ?? (options.actionLabel ? ACTION_DURATION_MS : options.tone === "error" ? ERROR_DURATION_MS : TOAST_DURATION_MS);
    durationRef.current = duration;
    setToast({ ...options, id: Date.now() + Math.random() });
    startTimer(duration);
  }, [startTimer]);

  const showSuccessToast = useCallback((message: string) => showToast({ message }), [showToast]);

  useEffect(() => clearTimer, [clearTimer]);

  const isError = toast?.tone === "error";

  return (
    <ToastContext.Provider value={{ showSuccessToast, showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] max-w-[calc(100vw-2.5rem)] pointer-events-none">
        {toast && (
          <div
            key={toast.id}
            role={isError ? "alert" : "status"}
            onMouseEnter={clearTimer}
            onMouseLeave={() => startTimer(durationRef.current)}
            onFocus={clearTimer}
            onBlur={() => startTimer(durationRef.current)}
            className={`pointer-events-auto flex items-center gap-2.5 bg-white border shadow-lg rounded-xl px-4 py-3 text-sm text-slate-700 animate-toast-in ${
              isError ? "border-red-300" : "border-emerald-200"
            }`}
          >
            <span
              aria-hidden="true"
              className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${isError ? "bg-red-100" : "bg-emerald-100"}`}
            >
              {isError ? (
                <svg className="w-3 h-3 text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5m0 3.5v.01" />
                </svg>
              ) : (
                <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            <span className="font-medium">{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  clearTimer();
                  setToast(null);
                  toast.onAction?.();
                }}
                className="ml-1 min-h-8 shrink-0 rounded-md px-2.5 text-sm font-semibold text-indigo-800 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
