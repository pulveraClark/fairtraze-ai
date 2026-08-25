import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";

interface ToastState {
  id: number;
  message: string;
}

interface ToastContextValue {
  showSuccessToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 2000;

// Global success feedback — consistent position (bottom-right), style, and duration
// across every form in the app (Create Class, Create Project, Save Scoring Settings,
// Resolve Dispute, Assign Role, etc.).
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSuccessToast = useCallback((message: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = Date.now();
    setToast({ id, message });
    timerRef.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showSuccessToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] pointer-events-none">
        {toast && (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-center gap-2.5 bg-white border border-emerald-200 shadow-lg rounded-xl px-4 py-3 text-sm text-slate-700 animate-toast-in"
          >
            <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <span className="font-medium">{toast.message}</span>
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
