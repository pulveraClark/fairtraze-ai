import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "../router";
import { useAuth } from "../context/AuthContext";

// ── Left-panel illustration: stylized contribution dashboard ──────────────────
function AuthIllustration() {
  return (
    <svg viewBox="0 0 320 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-xs mx-auto">
      {/* Card background */}
      <rect x="20" y="20" width="280" height="180" rx="16" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />

      {/* Card header bar */}
      <rect x="20" y="20" width="280" height="42" rx="16" fill="rgba(255,255,255,0.08)" />
      <rect x="20" y="46" width="280" height="16" fill="rgba(255,255,255,0.08)" />
      {/* Browser dots */}
      <circle cx="46" cy="41" r="5" fill="rgba(255,255,255,0.2)" />
      <circle cx="62" cy="41" r="5" fill="rgba(255,255,255,0.2)" />
      <circle cx="78" cy="41" r="5" fill="rgba(255,255,255,0.2)" />

      {/* Team Health label */}
      <text x="40" y="82" fontSize="8" fill="rgba(255,255,255,0.45)" fontFamily="monospace" letterSpacing="1.5">TEAM HEALTH</text>
      {/* Health badge */}
      <rect x="40" y="88" width="88" height="18" rx="6" fill="rgba(251,191,36,0.25)" stroke="rgba(251,191,36,0.45)" strokeWidth="1" />
      <circle cx="52" cy="97" r="3.5" fill="rgba(251,191,36,0.8)" />
      <text x="68" y="101" fontSize="8.5" fill="rgba(251,191,36,0.95)" fontFamily="sans-serif" fontWeight="bold">Moderate Risk</text>

      {/* Contribution bars label */}
      <text x="40" y="122" fontSize="8" fill="rgba(255,255,255,0.45)" fontFamily="monospace" letterSpacing="1.5">CONTRIBUTION SHARE</text>

      {/* Member A — overload, indigo full */}
      <rect x="40" y="128" width="24" height="9" rx="2.5" fill="rgba(255,255,255,0.2)" />
      <rect x="70" y="128" width="158" height="9" rx="2.5" fill="rgba(165,180,252,0.65)" />
      <text x="236" y="137" fontSize="8" fill="rgba(255,255,255,0.5)" fontFamily="monospace">36%</text>

      {/* Member B */}
      <rect x="40" y="143" width="24" height="9" rx="2.5" fill="rgba(255,255,255,0.2)" />
      <rect x="70" y="143" width="110" height="9" rx="2.5" fill="rgba(165,180,252,0.5)" />
      <text x="236" y="152" fontSize="8" fill="rgba(255,255,255,0.5)" fontFamily="monospace">26%</text>

      {/* Member C */}
      <rect x="40" y="158" width="24" height="9" rx="2.5" fill="rgba(255,255,255,0.2)" />
      <rect x="70" y="158" width="105" height="9" rx="2.5" fill="rgba(165,180,252,0.5)" />
      <text x="236" y="167" fontSize="8" fill="rgba(255,255,255,0.5)" fontFamily="monospace">25%</text>

      {/* Member D — free-rider, red */}
      <rect x="40" y="173" width="24" height="9" rx="2.5" fill="rgba(255,255,255,0.2)" />
      <rect x="70" y="173" width="54" height="9" rx="2.5" fill="rgba(248,113,113,0.6)" />
      <text x="236" y="182" fontSize="8" fill="rgba(255,255,255,0.5)" fontFamily="monospace">13%</text>

      {/* Free-rider badge */}
      <rect x="130" y="171" width="56" height="13" rx="3.5" fill="rgba(248,113,113,0.2)" stroke="rgba(248,113,113,0.4)" strokeWidth="1" />
      <text x="158" y="181" fontSize="7" fill="rgba(248,113,113,0.9)" fontFamily="monospace" textAnchor="middle" fontWeight="bold">FREE RIDER</text>
    </svg>
  );
}

export function LoginPage() {
  const { navigate } = useRouter();
  const { login, user, loading: authLoading } = useAuth();

  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      navigate(user.systemRole === "STUDENT" ? "/student" : user.systemRole === "ADMIN" ? "/admin" : "/dashboard");
    }
  }, [authLoading, user, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <span className="h-4 w-4 rounded-full border-2 border-indigo-400/40 border-t-indigo-500 animate-spin" />
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedInUser = await login(email, password);
      const next = localStorage.getItem("ft_next");
      localStorage.removeItem("ft_next");
      if (next) {
        navigate(next);
      } else {
        navigate(loggedInUser.systemRole === "STUDENT" ? "/student" : loggedInUser.systemRole === "ADMIN" ? "/admin" : "/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg bg-white border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all";

  return (
    <div className="min-h-screen flex bg-slate-50">

      {/* ── Left panel: illustration (desktop only) ── */}
      <div className="hidden lg:flex lg:w-[44%] xl:w-[42%] bg-gradient-to-br from-indigo-600 to-violet-700 flex-col justify-between p-12 relative overflow-hidden">

        {/* Background dot grid */}
        <div
          className="absolute inset-0 opacity-[0.12] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        {/* Decorative blobs */}
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-white/8 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-16 w-56 h-56 rounded-full bg-indigo-400/20 blur-3xl pointer-events-none" />

        {/* Top: wordmark */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m8 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6" />
            </svg>
          </div>
          <span className="font-display font-bold text-white text-sm tracking-tight">FAIR TRAZE AI</span>
        </div>

        {/* Center: illustration + copy */}
        <div className="relative z-10 space-y-7">
          <AuthIllustration />
          <div>
            <h2 className="font-display font-bold text-white text-2xl leading-tight mb-2">
              Fair assessment starts<br />with visible data.
            </h2>
            <p className="text-indigo-200 text-sm leading-relaxed">
              Every score is computed deterministically from real collaboration traces.
              The AI only explains the numbers — it never assigns grades.
            </p>
          </div>
        </div>

        {/* Bottom: tagline */}
        <p className="relative z-10 text-indigo-300/80 text-xs font-medium italic">
          "The math scores. The AI explains."
        </p>
      </div>

      {/* ── Right panel: form ── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 relative">

        {/* Back link */}
        <button
          onClick={() => navigate("/")}
          className="absolute top-6 left-6 flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Home
        </button>

        <div className="w-full max-w-sm">

          {/* Mobile wordmark */}
          <div className="lg:hidden text-center mb-8">
            <span className="font-display font-bold text-slate-900 text-lg tracking-tight">
              FAIR <span className="text-indigo-600">TRAZE</span> AI
            </span>
          </div>

          {/* Heading */}
          <div className="mb-7">
            <h1 className="font-display font-bold text-slate-900 text-2xl mb-1">Welcome back</h1>
            <p className="text-slate-500 text-sm">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {/* Email */}
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

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3.5 py-3">
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-red-700 leading-relaxed">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </span>
              ) : "Sign in"}
            </button>

          </form>

          <p className="text-center text-xs text-slate-500 mt-5">
            Don't have an account?{" "}
            <button
              onClick={() => navigate("/register")}
              className="text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
            >
              Register
            </button>
          </p>
        </div>
      </div>

    </div>
  );
}
