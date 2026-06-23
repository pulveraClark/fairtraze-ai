import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "../router";
import { useAuth } from "../context/AuthContext";

// ── Left-panel illustration: source connection diagram ────────────────────────
function AuthIllustration() {
  return (
    <svg viewBox="0 0 320 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-xs mx-auto">
      {/* Central "FT" hub */}
      <circle cx="160" cy="110" r="38" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      <text x="160" y="108" textAnchor="middle" fontSize="15" fill="white" fontFamily="system-ui, sans-serif" fontWeight="800">FAIR</text>
      <text x="160" y="124" textAnchor="middle" fontSize="15" fill="rgba(196,181,253,0.95)" fontFamily="system-ui, sans-serif" fontWeight="800">TRAZE</text>

      {/* Left node: GitHub */}
      <circle cx="58" cy="110" r="28" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
      <text x="58" y="106" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.7)" fontFamily="monospace" letterSpacing="0.5">GitHub</text>
      {/* GitHub icon (simplified) */}
      <circle cx="58" cy="116" r="8" fill="rgba(255,255,255,0.3)" />
      <path d="M54.5 113.5 C54.5 111.8 55.8 110.5 57.5 110.5 C59.2 110.5 60.5 111.8 60.5 113.5 C60.5 115 59.6 116.3 58.3 116.7 L58.3 119.5 L57.7 119.5 L57.7 116.7 C56.4 116.3 55.5 115 55.5 113.5 Z M58 111.5 C56.9 111.5 56 112.4 56 113.5 C56 114.6 56.9 115.5 58 115.5 C59.1 115.5 60 114.6 60 113.5 C60 112.4 59.1 111.5 58 111.5 Z" fill="white" opacity="0.7" />

      {/* Right node: FairTraze Docs */}
      <circle cx="262" cy="110" r="28" fill="rgba(255,255,255,0.08)" stroke="rgba(196,181,253,0.3)" strokeWidth="1.5" strokeDasharray="4 3" />
      <text x="262" y="103" textAnchor="middle" fontSize="7.5" fill="rgba(196,181,253,0.7)" fontFamily="sans-serif">FairTraze</text>
      <text x="262" y="113" textAnchor="middle" fontSize="7.5" fill="rgba(196,181,253,0.7)" fontFamily="sans-serif">Docs</text>
      <text x="262" y="128" textAnchor="middle" fontSize="7" fill="rgba(196,181,253,0.5)" fontFamily="sans-serif">soon</text>

      {/* Connection lines */}
      <line x1="87" y1="110" x2="121" y2="110" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeDasharray="5 3" />
      <line x1="199" y1="110" x2="233" y2="110" stroke="rgba(196,181,253,0.3)" strokeWidth="1.5" strokeDasharray="5 3" />

      {/* Arrows */}
      <polyline points="118,106 122,110 118,114" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      <polyline points="230,106 234,110 230,114" stroke="rgba(196,181,253,0.3)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />

      {/* Bottom caption */}
      <text x="160" y="168" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.5)" fontFamily="sans-serif">Contribution traces → Fairness Report</text>

      {/* Top: floating member bubbles */}
      <circle cx="90" cy="52" r="16" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <text x="90" y="56" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.75)" fontFamily="sans-serif" fontWeight="bold">A</text>

      <circle cx="130" cy="38" r="16" fill="rgba(165,180,252,0.2)" stroke="rgba(165,180,252,0.3)" strokeWidth="1" />
      <text x="130" y="42" textAnchor="middle" fontSize="10" fill="rgba(165,180,252,0.85)" fontFamily="sans-serif" fontWeight="bold">B</text>

      <circle cx="190" cy="38" r="16" fill="rgba(165,180,252,0.2)" stroke="rgba(165,180,252,0.3)" strokeWidth="1" />
      <text x="190" y="42" textAnchor="middle" fontSize="10" fill="rgba(165,180,252,0.85)" fontFamily="sans-serif" fontWeight="bold">C</text>

      <circle cx="230" cy="52" r="16" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <text x="230" y="56" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.75)" fontFamily="sans-serif" fontWeight="bold">D</text>

      {/* Lines from members to hub */}
      <line x1="99" y1="64" x2="142" y2="90" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <line x1="138" y1="53" x2="149" y2="84" stroke="rgba(165,180,252,0.2)" strokeWidth="1" />
      <line x1="182" y1="53" x2="171" y2="84" stroke="rgba(165,180,252,0.2)" strokeWidth="1" />
      <line x1="221" y1="64" x2="178" y2="90" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
    </svg>
  );
}

export function RegisterPage() {
  const { navigate } = useRouter();
  const { register, user, loading: authLoading } = useAuth();

  const [name,       setName]       = useState("");
  const [email,      setEmail]      = useState("");
  const [role,       setRole]       = useState<"INSTRUCTOR" | "STUDENT">("INSTRUCTOR");
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

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const newUser = await register(email, password, name, role);
      navigate(newUser.systemRole === "STUDENT" ? "/student" : newUser.systemRole === "ADMIN" ? "/admin" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
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
              Connect your students.<br />See who contributes.
            </h2>
            <p className="text-indigo-200 text-sm leading-relaxed">
              Set up your classes and projects in minutes.
              Students join via code, and FairTraze handles the rest —
              from data collection to explainable fairness reports.
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
            <h1 className="font-display font-bold text-slate-900 text-2xl mb-1">Create your account</h1>
            <p className="text-slate-500 text-sm">Get started with FairTraze AI</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {/* Full name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Jane Smith"
                required
                autoComplete="name"
                className={inputClass}
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Institutional email</label>
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

            {/* Role */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "INSTRUCTOR" | "STUDENT")}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="INSTRUCTOR" className="bg-white text-slate-900">Instructor</option>
                <option value="STUDENT"    className="bg-white text-slate-900">Student</option>
              </select>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
                <span className="ml-1.5 text-slate-400 font-normal">(min. 8 characters)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
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
              disabled={submitting || !name || !email || !password}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Creating account…
                </span>
              ) : "Create account"}
            </button>

          </form>

          <p className="text-center text-xs text-slate-500 mt-5">
            Already have an account?{" "}
            <button
              onClick={() => navigate("/login")}
              className="text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>

    </div>
  );
}
