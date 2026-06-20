import { useRouter } from "../router";

export function LoginPage() {
  const { navigate } = useRouter();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "#0b0d1a" }}
    >
      {/* Back link */}
      <button
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Home
      </button>

      {/* Card */}
      <div className="w-full max-w-sm">
        {/* Wordmark */}
        <div className="text-center mb-8">
          <span className="font-display font-bold text-lg text-white tracking-tight">
            FAIR <span className="text-amber-400">TRAZE</span> AI
          </span>
          <p className="text-slate-500 text-sm mt-1.5">Sign in to your account</p>
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-2xl px-8 py-8 space-y-5">
          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              disabled
              placeholder="you@university.edu"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-slate-500 placeholder-slate-600 cursor-not-allowed outline-none"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Password
            </label>
            <input
              type="password"
              disabled
              placeholder="••••••••"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-slate-500 placeholder-slate-600 cursor-not-allowed outline-none"
            />
          </div>

          {/* Coming soon notice */}
          <div className="flex items-start gap-2.5 rounded-lg bg-amber-400/8 border border-amber-400/20 px-3.5 py-3">
            <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-amber-300 leading-relaxed">
              Authentication is coming soon. Use{" "}
              <button
                onClick={() => navigate("/demo")}
                className="underline underline-offset-2 hover:text-amber-200 transition-colors"
              >
                Try the Demo
              </button>{" "}
              to explore the analyzer with seeded projects — no login needed.
            </p>
          </div>

          {/* Disabled submit */}
          <button
            disabled
            className="w-full py-2.5 rounded-xl bg-amber-400/30 text-amber-600 text-sm font-semibold cursor-not-allowed"
          >
            Sign in
          </button>
        </div>

        {/* Register link */}
        <p className="text-center text-xs text-slate-600 mt-5">
          Don't have an account?{" "}
          <button
            onClick={() => navigate("/register")}
            className="text-amber-500 hover:text-amber-400 transition-colors underline underline-offset-2"
          >
            Register
          </button>
        </p>
      </div>
    </div>
  );
}
