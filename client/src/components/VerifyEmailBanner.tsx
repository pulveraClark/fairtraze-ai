import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export function VerifyEmailBanner() {
  const { user, token } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  if (!user || user.emailVerified !== false) return null;

  async function handleResend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Resend failed (${res.status})`);
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend verification email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-amber-800">
            Please verify your email address ({user.email}). Some actions — creating or joining a group, running analysis — are unavailable until you do.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {error && <span className="text-xs text-red-600">{error}</span>}
          {sent ? (
            <span className="text-xs font-semibold text-amber-700">Sent — check your inbox.</span>
          ) : (
            <button
              onClick={() => void handleResend()}
              disabled={sending}
              className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline disabled:opacity-50"
            >
              {sending ? "Sending…" : "Resend email"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
