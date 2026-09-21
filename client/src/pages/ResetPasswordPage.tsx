import { useState, type FormEvent } from "react";
import { useRouter } from "../router";
import logoUrl from "../assets/logo_transparent.png";

const inputClass =
  "w-full rounded-lg bg-white border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all";

export function ResetPasswordPage() {
  const { navigate } = useRouter();
  const token = new URLSearchParams(window.location.search).get("token");

  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error,           setError]           = useState<string | null>(null);
  const [submitting,      setSubmitting]      = useState(false);
  const [succeeded,       setSucceeded]       = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, newPassword }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Reset failed (${res.status})`);
      setSucceeded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const heading = (
    <div className="text-center mb-8">
      <img src={logoUrl} alt="FAIR TRAZE AI" className="h-10 w-auto mx-auto mb-6" />
      <h1 className="font-display font-bold text-slate-900 text-2xl mb-1">Reset your password</h1>
    </div>
  );

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-sm text-center">
          {heading}
          <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3.5 py-3 text-left mb-5">
            <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-red-700 leading-relaxed">
              This reset link is missing a token. Request a new one below.
            </p>
          </div>
          <button
            onClick={() => navigate("/forgot-password")}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm shadow-indigo-600/20 transition-all active:scale-[0.99]"
          >
            Request a new link
          </button>
        </div>
      </div>
    );
  }

  if (succeeded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-sm text-center">
          {heading}
          <div className="flex items-start gap-2.5 rounded-lg bg-indigo-50 border border-indigo-200 px-3.5 py-3 text-left mb-5">
            <svg className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-indigo-700 leading-relaxed">
              Password reset successful. Please log in with your new password.
            </p>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm shadow-indigo-600/20 transition-all active:scale-[0.99]"
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">
        {heading}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              New password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Confirm new password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              className={inputClass}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3.5 py-3">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-red-700 leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !newPassword || !confirmPassword}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Resetting…
              </span>
            ) : "Reset password"}
          </button>
        </form>
      </div>
    </div>
  );
}
