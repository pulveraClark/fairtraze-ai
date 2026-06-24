import { useEffect } from "react";
import { useRouter } from "../router";
import { useAuth } from "../context/AuthContext";
import { UserMenu } from "../components/UserMenu";

// ── Static preview data ───────────────────────────────────────────────────────
const PREVIEW_MEMBERS = [
  { name: "Member A", pct: 36, flag: "overload"   as const },
  { name: "Member B", pct: 26, flag: null },
  { name: "Member C", pct: 25, flag: null },
  { name: "Member D", pct: 13, flag: "free-rider" as const },
] as const;

// ── Hero product mockup (light-mode card) ─────────────────────────────────────
function ProductPreview() {
  return (
    <div className="relative w-full max-w-[560px] mx-auto">
      {/* Soft indigo halo behind the card */}
      <div
        className="absolute inset-0 -z-10 blur-[56px] opacity-25 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 60%, #6366f1 0%, transparent 70%)" }}
      />

      {/* Floating chip — GitHub */}
      <div
        className="absolute -top-4 left-3 z-20 animate-float bg-white shadow-[0_4px_16px_rgba(0,0,0,0.09)] border border-slate-100 rounded-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-semibold text-slate-700 whitespace-nowrap"
        style={{ animationDelay: "0.5s" }}
      >
        <svg className="w-3.5 h-3.5 text-slate-800 shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
        </svg>
        GitHub Connected
      </div>

      {/* Floating chip — members scored */}
      <div
        className="absolute -bottom-4 right-6 z-20 animate-float bg-white shadow-[0_4px_16px_rgba(0,0,0,0.09)] border border-slate-100 rounded-full px-3 py-1.5 flex items-center gap-2 text-[11px] font-semibold text-slate-700 whitespace-nowrap"
        style={{ animationDelay: "1.2s" }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
        4 members scored
      </div>

      {/* The card */}
      <div className="animate-float bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-[0_20px_60px_-10px_rgba(99,102,241,0.12),0_8px_24px_-4px_rgba(0,0,0,0.07)]">

        {/* Faux browser chrome */}
        <div className="bg-slate-50 px-5 py-3 flex items-center justify-between border-b border-slate-200">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
          </div>
          <div className="flex-1 max-w-[200px] mx-4 bg-white rounded border border-slate-200 py-1 text-center">
            <span className="text-[10px] text-slate-400 font-mono">app.fairtraze.ai/report/cs101</span>
          </div>
          <div className="w-10" />
        </div>

        {/* Card content */}
        <div className="flex flex-col sm:flex-row p-6 gap-6">

          {/* Left: team health + bars */}
          <div className="flex-1 space-y-5">
            <div className="pb-4 border-b border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-3">Team Health</p>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />
                  Moderate Risk
                </span>
                <span className="text-slate-500 text-sm">
                  Gini: <span className="font-bold text-slate-800">0.21</span>
                </span>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-4">Contribution Share</p>
              <div className="space-y-3">
                {PREVIEW_MEMBERS.map(({ name, pct, flag }) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-xs text-slate-700 w-16 shrink-0 font-semibold">{name}</span>
                    <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          flag === "free-rider" ? "bg-red-400" :
                          flag === "overload"   ? "bg-amber-500" :
                          "bg-indigo-500"
                        }`}
                        style={{ width: `${pct * 2.6}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-800 w-8 text-right shrink-0">{pct}%</span>
                    {flag ? (
                      <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wide shrink-0 ${
                        flag === "free-rider"
                          ? "bg-red-50 text-red-600 border border-red-200"
                          : "bg-amber-50 text-amber-600 border border-amber-200"
                      }`}>
                        {flag}
                      </span>
                    ) : (
                      <span className="w-16 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: AI narrative panel */}
          <div className="w-full sm:w-60 shrink-0">
            <div className="h-full rounded-xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100/60 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-md bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-600/20">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest">AI Narrative</p>
              </div>
              <p className="text-xs text-indigo-950/80 leading-relaxed font-medium">
                Member A's contribution share (36%) is well above the team's equal share, indicating a workload
                concentration. Member D's share (13%) falls significantly below the expected minimum…
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function LandingPage() {
  const { navigate } = useRouter();
  const { user, loading: authLoading } = useAuth();

  const dashboardPath =
    !authLoading && user
      ? user.systemRole === "STUDENT" ? "/student"
      : user.systemRole === "ADMIN"   ? "/admin"
      : "/dashboard"
      : null;

  // Auto-redirect on fresh page load when authenticated.
  // router.ts tags every internal navigate() with { intentional: true }, so
  // logo clicks and browser-back land here without triggering this redirect.
  useEffect(() => {
    if (authLoading || !user || !dashboardPath) return;
    const intentional = (window.history.state as { intentional?: boolean } | null)?.intentional;
    if (intentional) return;
    // Mark this history entry so browser-back here won't re-redirect.
    history.replaceState({ intentional: true }, "", "/");
    navigate(dashboardPath);
  }, [authLoading, user, dashboardPath, navigate]);

  return (
    <div className="min-h-screen bg-white">

      {/* ══════════════════════════════════════════════════════
          NAV — sticky, white, clean
      ══════════════════════════════════════════════════════ */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-3.5 flex items-center justify-between gap-4">

          {/* Wordmark */}
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 group shrink-0"
          >
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-600/25 group-hover:bg-indigo-700 transition-colors">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m8 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6" />
              </svg>
            </div>
            <span className="font-display font-bold text-slate-900 text-sm tracking-tight">
              FAIR <span className="text-indigo-600">TRAZE</span>{" "}
              <span className="font-medium text-slate-400">AI</span>
            </span>
          </button>

          {/* Right actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {!authLoading && user && dashboardPath ? (
              /* Logged in: go-to-dashboard button + user menu */
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(dashboardPath)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-600/20 transition-all active:scale-[0.98]"
                >
                  Go to Dashboard
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
                  </svg>
                </button>
                <UserMenu theme="light" />
              </div>
            ) : !authLoading ? (
              /* Logged out */
              <>
                <button
                  onClick={() => navigate("/login")}
                  className="text-sm font-semibold text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 transition-all px-4 py-2 rounded-lg"
                >
                  Sign in
                </button>
                <button
                  onClick={() => navigate("/register")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-600/20 transition-all active:scale-[0.98]"
                >
                  Get Started
                </button>
              </>
            ) : null /* loading — render nothing to avoid flash */}
          </div>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════
          HERO — light, spacious, split layout
      ══════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden pt-16 sm:pt-24 pb-20 sm:pb-28 px-6 sm:px-8 bg-gradient-to-b from-slate-50/80 via-white to-white">

        {/* Subtle dot-grid texture */}
        <div
          className="absolute inset-0 opacity-[0.35] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, #c7d2fe 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />

        <div className="relative max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* ── Left: copy ── */}
            <div className="animate-fade-in-up">

              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-bold text-indigo-700 uppercase tracking-widest mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                Github & FairTraze Docs
              </div>

              {/* Headline */}
              <h1
                className="font-display font-extrabold text-slate-900 leading-[1.1] tracking-tight mb-5"
                style={{ fontSize: "clamp(2.25rem, 4.5vw, 3.75rem)" }}
              >
                Know who really<br />
                contributed —<br />
                <span className="text-indigo-600">before grades are set.</span>
              </h1>

              {/* Tagline */}
              <p className="text-slate-600 leading-relaxed font-medium text-base sm:text-lg mb-8 max-w-lg">
                Collect digital collaboration traces from GitHub and the FairTraze Editor.
                Score contributions deterministically. Get an evidence-based fairness report —
                so you can assess individual work with confidence.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-3">
                {dashboardPath ? (
                  <button
                    onClick={() => navigate(dashboardPath)}
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 hover:shadow-lg hover:shadow-indigo-600/25 active:scale-[0.98] transition-all"
                  >
                    Go to Dashboard
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
                    </svg>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => navigate("/login")}
                      className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 hover:shadow-lg hover:shadow-indigo-600/25 active:scale-[0.98] transition-all"
                    >
                      Sign In
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50/50 active:scale-[0.98] transition-all"
                    >
                      How it works
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </>
                )}
              </div>

              {/* Trust strip */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-8 pt-7 border-t border-slate-100">
                {[
                  "100% deterministic scoring",
                  "Evidence-based fairness reports",
                  "Supports instructor judgment",
                ].map((fact) => (
                  <p key={fact} className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {fact}
                  </p>
                ))}
              </div>
            </div>

            {/* ── Right: product preview mockup ── */}
            <div className="animate-fade-in-up delay-200 lg:pl-4">
              <ProductPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          HOW IT WORKS — 3 numbered steps
      ══════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-20 sm:py-28 px-6 sm:px-8 bg-slate-50">
        <div className="max-w-6xl mx-auto">

          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600 mb-3">How It Works</p>
            <h2 className="font-display font-bold text-slate-900 text-3xl sm:text-4xl">
              Three steps to fair assessment
            </h2>
            <p className="text-slate-500 mt-3 text-base max-w-xl mx-auto">
              From raw collaboration data to an actionable, explainable fairness report.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">

            {/* Step 1 */}
            <div className="bg-white rounded-2xl p-7 border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group">
              <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-display font-extrabold text-lg mb-5 group-hover:scale-105 transition-transform shadow-sm shadow-indigo-600/25">
                1
              </div>
              <h3 className="font-display font-bold text-slate-900 text-lg mb-2">Connect Your Sources</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Link a GitHub repository for your project. Students connect with a join code — no manual roster entry. FairTraze Docs support coming soon.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-2xl p-7 border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group">
              <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-display font-extrabold text-lg mb-5 group-hover:scale-105 transition-transform shadow-sm shadow-indigo-600/25">
                2
              </div>
              <h3 className="font-display font-bold text-slate-900 text-lg mb-2">Scores Computed Automatically</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Deterministic math — commits, meaningful lines of code, and active days — combined into a transparent contribution share for every member. No AI guesswork in the numbers.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-2xl p-7 border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group">
              <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-display font-extrabold text-lg mb-5 group-hover:scale-105 transition-transform shadow-sm shadow-indigo-600/25">
                3
              </div>
              <h3 className="font-display font-bold text-slate-900 text-lg mb-2">Get an Explainable Report</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                AI writes a plain-language narrative explaining the already-computed numbers, flags imbalances, and surfaces evidence for your review. Outputs support judgment — they never assign grades.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          DATA SOURCES — GitHub + FairTraze Docs
      ══════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 px-6 sm:px-8 bg-white">
        <div className="max-w-6xl mx-auto">

          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600 mb-3">Data Sources</p>
            <h2 className="font-display font-bold text-slate-900 text-3xl sm:text-4xl">
              Works where your students collaborate
            </h2>
            <p className="text-slate-500 mt-3 text-base max-w-xl mx-auto">
              GitHub captures code. FairTraze Docs captures writing. Together they give a complete picture of each member's contribution.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">

            {/* GitHub card */}
            <div className="relative rounded-2xl border border-slate-200 p-8 bg-white shadow-sm hover:shadow-md hover:border-slate-300 transition-all overflow-hidden group">
              <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-slate-100/70 blur-3xl pointer-events-none group-hover:bg-indigo-100/40 transition-colors" />
              <div className="flex items-start justify-between mb-6 relative">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shadow-sm">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                  Active
                </span>
              </div>
              <h3 className="font-display font-bold text-slate-900 text-xl mb-2">GitHub</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-5">
                Analyze commits, diff patches, and activity patterns. Meaningful-line detection separates code from comments and blanks. Significance scoring weights production source files over config and generated files.
              </p>
              <div className="flex flex-wrap gap-2">
                {["Commits", "Diffs", "Active days", "Contribution share"].map((tag) => (
                  <span key={tag} className="text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* FairTraze Docs card */}
            <div className="relative rounded-2xl border border-indigo-100 p-8 bg-indigo-50/40 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all overflow-hidden group">
              <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-indigo-100/60 blur-3xl pointer-events-none group-hover:bg-indigo-200/40 transition-colors" />
              <div className="flex items-start justify-between mb-6 relative">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-600/20">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-100 border border-indigo-200 rounded-full px-2.5 py-1">
                  In development
                </span>
              </div>
              <h3 className="font-display font-bold text-slate-900 text-xl mb-2">FairTraze Docs</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-5">
                A built-in collaborative editor that records per-user, timestamped document traces — capturing writing and documentation contributions that GitHub misses entirely. Essential for documentation-focused members.
              </p>
              <div className="flex flex-wrap gap-2">
                {["Net retained text", "Edit sessions", "Comments & suggestions", "Revision history"].map((tag) => (
                  <span key={tag} className="text-[11px] font-semibold text-indigo-700/70 bg-indigo-100/60 rounded-full px-2.5 py-1">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          PRINCIPLE BANNER — "The math scores. The AI explains."
      ══════════════════════════════════════════════════════ */}
      <section className="py-16 sm:py-24 px-6 sm:px-8 bg-indigo-600 relative overflow-hidden">
        {/* Subtle decorative circles */}
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center">
          <p className="text-indigo-300 text-xs font-bold uppercase tracking-[0.2em] mb-4">Core Principle</p>
          <h2
            className="font-display font-extrabold text-white leading-tight mb-5"
            style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
          >
            The math scores.<br />The AI explains.
          </h2>
          <p className="text-indigo-200 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-8">
            All contribution scores, flags, and the Gini coefficient are computed deterministically in code —
            no AI guesswork involved. Gemini writes the plain-language narrative only after the numbers are
            finalized. Outputs support instructor judgment; they never assign grades.
          </p>
          {!dashboardPath && (
            <button
              onClick={() => navigate("/register")}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-indigo-700 bg-white hover:bg-indigo-50 rounded-xl shadow-sm active:scale-[0.98] transition-all"
            >
              Get Started Free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
              </svg>
            </button>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════ */}
      <footer className="py-10 px-6 sm:px-8 bg-white border-t border-slate-100">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-5">

          {/* Wordmark */}
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 group shrink-0"
          >
            <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center group-hover:bg-indigo-700 transition-colors">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m8 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6" />
              </svg>
            </div>
            <span className="font-display font-bold text-slate-900 text-sm tracking-tight">
              FAIR <span className="text-indigo-600">TRAZE</span>{" "}
              <span className="text-slate-400 font-medium">AI</span>
            </span>
          </button>

          <p className="text-xs text-slate-400 text-center max-w-sm leading-relaxed">
            Outputs are evidence to support instructor judgment — they do not constitute grades or final assessments.
          </p>

          <button
            onClick={() => navigate("/overview")}
            className="text-xs text-slate-400 hover:text-indigo-600 transition-colors font-semibold shrink-0"
          >
            System Overview →
          </button>

        </div>
      </footer>

    </div>
  );
}
