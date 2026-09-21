import { useState, type FormEvent } from "react";
import { useRouter } from "../router";
import logoUrl from "../assets/logo_transparent.png";

const inputClass =
  "w-full rounded-lg bg-white border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all";

export function ForgotPasswordPage() {
  const { navigate } = useRouter();

  const [email,      setEmail]      = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
    } catch {
      // Network error — still show the generic message; nothing more to reveal here.
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <img src={logoUrl} alt="FAIR TRAZE AI" className="h-10 w-auto mx-auto mb-6" />
          <h1 className="font-display font-bold text-slate-900 text-2xl mb-1">Forgot your password?</h1>
          <p className="text-slate-500 text-sm">
            Enter your email and we'll send you a link to reset it.
          </p>
        </div>

        {submitted ? (
          <div className="space-y-5">
            <div className="flex items-start gap-2.5 rounded-lg bg-indigo-50 border border-indigo-200 px-3.5 py-3">
              <svg className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-indigo-700 leading-relaxed">
                If an account exists for that email, we've sent a reset link. Check your inbox.
              </p>
            </div>
            <button
              onClick={() => navigate("/login")}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm shadow-indigo-600/20 transition-all active:scale-[0.99]"
            >
              Back to login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                required
                autoComplete="email"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !email}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Sending…
                </span>
              ) : "Send reset link"}
            </button>

            <p className="text-center text-xs text-slate-500 mt-5">
              Remembered it?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
              >
                Back to login
              </button>
            </p>
          </form>
        )}

      </div>
    </div>
  );
}
