import { useRouter } from "../router";

// ── Decorative commit-graph SVG background ────────────────────────────────────
function CommitGraphMotif() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      viewBox="0 0 1200 680"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g stroke="white" fill="white" opacity="0.06">
        {/* Timeline tracks */}
        <line x1="0" y1="110" x2="1200" y2="110" strokeWidth="1" />
        <line x1="0" y1="310" x2="1200" y2="310" strokeWidth="1" />
        <line x1="0" y1="510" x2="1200" y2="510" strokeWidth="1" />

        {/* Track 1 — commit nodes */}
        {[55, 165, 295, 430, 580, 740, 895, 1060, 1160].map((cx) => (
          <circle key={`t1-${cx}`} cx={cx} cy="110" r="4.5" />
        ))}
        {/* Track 2 — commit nodes */}
        {[90, 220, 370, 520, 660, 800, 950, 1110].map((cx) => (
          <circle key={`t2-${cx}`} cx={cx} cy="310" r="4.5" />
        ))}
        {/* Track 3 — commit nodes */}
        {[120, 260, 420, 590, 745, 900, 1050, 1170].map((cx) => (
          <circle key={`t3-${cx}`} cx={cx} cy="510" r="4.5" />
        ))}

        {/* Branch / merge connectors — subtle diagonal paths */}
        <path d="M 295 110 C 295 200 370 220 370 310" strokeWidth="1" fill="none" />
        <path d="M 660 310 C 660 400 745 420 745 510" strokeWidth="1" fill="none" />
        <path d="M 800 310 C 800 200 895 160 895 110" strokeWidth="1" fill="none" />
        <path d="M 950 310 C 950 420 1050 440 1050 510" strokeWidth="1" fill="none" />
        <path d="M 520 310 C 520 400 590 420 590 510" strokeWidth="1" fill="none" />
        <path d="M 1060 110 C 1060 200 1110 230 1110 310" strokeWidth="1" fill="none" />
      </g>
    </svg>
  );
}

// ── Static product-preview card ───────────────────────────────────────────────
// A hand-coded mockup of the real report UI — decorative, not interactive.
const PREVIEW_MEMBERS = [
  { name: "Member A", pct: 36, flag: "overload"   as const },
  { name: "Member B", pct: 26, flag: null },
  { name: "Member C", pct: 25, flag: null },
  { name: "Member D", pct: 13, flag: "free-rider" as const },
] as const;

function ProductPreview() {
  return (
    <div className="relative">
      {/* Ambient glow behind the card */}
      <div
        className="absolute -inset-6 rounded-3xl pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(99,102,241,0.22) 0%, transparent 70%)",
        }}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-slate-200 w-[22rem]">
        {/* Faux browser chrome */}
        <div className="bg-slate-50 px-4 py-2.5 flex items-center gap-2.5 border-b border-slate-200">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            fairtraze · Contribution Report
          </span>
        </div>

        {/* Team health row */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-100">
          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Team Health
          </p>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
              Moderate Risk
            </span>
            <span className="text-slate-500 text-xs">
              Gini:{" "}
              <span className="font-semibold text-slate-700">0.21</span>
            </span>
          </div>
        </div>

        {/* Contribution bars */}
        <div className="px-5 py-4 space-y-2.5">
          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Contribution Share
          </p>
          {PREVIEW_MEMBERS.map(({ name, pct, flag }) => (
            <div key={name} className="flex items-center gap-2">
              <span className="text-[11px] text-slate-600 w-16 shrink-0">{name}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    flag === "free-rider"
                      ? "bg-red-400"
                      : flag === "overload"
                      ? "bg-orange-400"
                      : "bg-indigo-400"
                  }`}
                  style={{ width: `${pct * 2.6}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-slate-700 w-7 text-right shrink-0">
                {pct}%
              </span>
              {flag && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                    flag === "free-rider"
                      ? "bg-red-100 text-red-700"
                      : "bg-orange-100 text-orange-700"
                  }`}
                >
                  {flag}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* AI narrative teaser */}
        <div className="px-5 pb-4">
          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2.5">
            <p className="text-[9px] font-semibold text-indigo-400 uppercase tracking-widest mb-1">
              AI Fairness Narrative
            </p>
            <p className="text-[10px] text-indigo-700 leading-relaxed">
              Member A's contribution share is well above the team's equal share, indicating a workload
              concentration. Member D's share falls below the expected minimum…
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── How-it-works step ─────────────────────────────────────────────────────────
const HOW_STEPS = [
  {
    n: "01",
    title: "Connect",
    accentColor: "border-amber-400",
    desc: "Connect a project to its GitHub repository. The system fetches per-contributor commit history, additions, deletions, and file-level diffs — paginated and rate-limit-aware. The FAIR TRAZE Collaborative Editor is the planned second source (Phase D).",
  },
  {
    n: "02",
    title: "Score",
    accentColor: "border-indigo-500",
    desc: "A deterministic engine computes each member's contribution share from weighted commits, meaningful code lines (with file-type and commit-impact multipliers), and active days.",
  },
  {
    n: "03",
    title: "Report",
    accentColor: "border-emerald-500",
    desc: "Participation flags (inactive, free-rider, overload, deadline-driven), a Gini coefficient, team-health label, and an AI-written plain-language narrative are assembled into a reviewable report.",
  },
] as const;

// ── Main component ─────────────────────────────────────────────────────────────
export function LandingPage() {
  const { navigate } = useRouter();

  return (
    <div className="min-h-screen bg-white">

      {/* ══════════════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden"
        style={{ background: "#0b0d1a" }}
      >
        {/* Commit-graph pattern */}
        <CommitGraphMotif />

        {/* Deep violet radial glow from upper-left */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 65% 70% at 18% 38%, rgba(79,70,229,0.18) 0%, transparent 100%)",
          }}
        />
        {/* Subtle amber warmth from right edge */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 40% 50% at 90% 55%, rgba(245,158,11,0.07) 0%, transparent 100%)",
          }}
        />

        {/* ── Navigation ── */}
        <nav className="relative z-10 flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
          {/* Wordmark */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m8 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6" />
              </svg>
            </div>
            <span className="font-display font-bold text-base tracking-tight text-white">
              FAIR <span className="text-amber-400">TRAZE</span> AI
            </span>
          </div>

          {/* Nav links */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/overview")}
              className="hidden sm:block px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-white/5"
            >
              System Overview
            </button>
            <button
              onClick={() => navigate("/login")}
              className="px-4 py-1.5 text-sm font-medium text-slate-200 border border-white/15 rounded-lg hover:bg-white/8 hover:border-white/25 transition-all"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate("/register")}
              className="px-4 py-1.5 text-sm font-semibold bg-amber-400 text-slate-900 rounded-lg hover:bg-amber-300 transition-colors shadow-lg shadow-amber-500/15"
            >
              Register
            </button>
          </div>
        </nav>

        {/* ── Hero content ── */}
        <div className="relative z-10 max-w-7xl mx-auto px-8 pt-14 pb-24 flex items-center gap-12 lg:gap-20">

          {/* Left column — headline + CTAs */}
          <div className="flex-1 min-w-0">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/8 border border-white/12 text-xs text-slate-400 mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
              GitHub Analysis Live · Collaborative Editor Coming
            </div>

            {/* Headline */}
            <h1 className="font-display font-bold leading-[1.07] tracking-tight text-white mb-5"
                style={{ fontSize: "clamp(2.4rem, 4.5vw, 3.6rem)" }}>
              Contribution<br />
              <span className="text-amber-400">Fairness</span> &amp;<br />
              Imbalance Detection
            </h1>

            {/* Tagline */}
            <p className="text-slate-400 leading-relaxed mb-10 max-w-lg"
               style={{ fontSize: "clamp(0.95rem, 1.4vw, 1.1rem)" }}>
              Collect digital collaboration traces from GitHub and the FAIR TRAZE
              Collaborative Editor, score each member's contribution deterministically
              across both sources, and generate an evidence-based fairness report —
              so instructors can assess individual work with confidence.
            </p>

            {/* Primary CTAs */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => navigate("/demo")}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-amber-400 text-slate-900 text-sm font-semibold rounded-xl hover:bg-amber-300 active:scale-[0.98] transition-all shadow-lg shadow-amber-500/25"
                >
                  Try the Demo
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => navigate("/overview")}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white border border-white/20 rounded-xl hover:bg-white/8 hover:border-white/30 active:scale-[0.98] transition-all"
                >
                  System Overview
                </button>
              </div>

              {/* Secondary auth links */}
              <div className="flex items-center gap-4 text-sm">
                <button
                  onClick={() => navigate("/login")}
                  className="text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2 decoration-slate-700 hover:decoration-slate-400"
                >
                  Sign in to your account
                </button>
                <span className="text-slate-700" aria-hidden>·</span>
                <button
                  onClick={() => navigate("/register")}
                  className="text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2 decoration-slate-700 hover:decoration-slate-400"
                >
                  Create an account
                </button>
              </div>
            </div>
          </div>

          {/* Right column — product preview */}
          <div className="hidden lg:flex items-center justify-center shrink-0">
            <ProductPreview />
          </div>
        </div>

        {/* Bottom fade into white section */}
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, transparent, rgba(255,255,255,0.03))",
          }}
        />
      </section>

      {/* ══════════════════════════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-8 bg-white">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 mb-3">
            How it works
          </p>
          <h2 className="font-display font-bold text-slate-900 mb-14"
              style={{ fontSize: "clamp(1.4rem, 2.5vw, 1.75rem)" }}>
            From repository to report in three steps
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-100 rounded-2xl overflow-hidden shadow-sm">
            {HOW_STEPS.map((step) => (
              <div
                key={step.n}
                className={`bg-white px-7 py-8 border-t-2 ${step.accentColor}`}
              >
                <span
                  className="block font-display font-bold text-slate-100 mb-4 leading-none select-none"
                  style={{ fontSize: "2.75rem" }}
                >
                  {step.n}
                </span>
                <h3 className="font-display font-semibold text-slate-800 text-base mb-3">
                  {step.title}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          PRINCIPLE CALLOUT  (dark panel)
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-16 px-8" style={{ background: "#0b0d1a" }}>
        <div className="max-w-5xl mx-auto flex flex-col lg:flex-row items-start gap-12">

          {/* Left: text */}
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-400 mb-3">
              Core Principle
            </p>
            <h2
              className="font-display font-bold text-white leading-tight mb-4"
              style={{ fontSize: "clamp(1.35rem, 2.2vw, 1.65rem)" }}
            >
              The math scores.<br />
              The AI explains.
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
              All contribution scores, flags, and the Gini coefficient are computed
              deterministically in code — no AI guesswork involved. Gemini writes
              the plain-language narrative only after the numbers are finalized.
              Outputs support instructor judgment; they never assign grades.
            </p>
          </div>

          {/* Right: four-cell grid */}
          <div className="flex-1 grid grid-cols-2 gap-3">
            {[
              { label: "Contribution scoring",    tag: "Deterministic", tagColor: "text-amber-400"  },
              { label: "Participation flags",      tag: "Deterministic", tagColor: "text-amber-400"  },
              { label: "Gini coefficient",         tag: "Deterministic", tagColor: "text-amber-400"  },
              { label: "Fairness narrative",       tag: "AI · Gemini",   tagColor: "text-indigo-400" },
            ].map(({ label, tag, tagColor }) => (
              <div
                key={label}
                className="rounded-xl bg-white/[0.04] border border-white/8 px-4 py-3.5 hover:bg-white/[0.06] transition-colors"
              >
                <span className={`text-[10px] font-semibold uppercase tracking-widest block mb-1 ${tagColor}`}>
                  {tag}
                </span>
                <p className="text-sm text-white">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════════════ */}
      <footer
        className="border-t border-white/[0.07] py-5 px-8"
        style={{ background: "#0b0d1a" }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <span className="font-display font-bold text-sm text-white tracking-tight">
            FAIR <span className="text-amber-400">TRAZE</span> AI
          </span>
          <p className="text-xs text-slate-600 text-center">
            Outputs support instructor judgment — they do not constitute grades or final assessments.
          </p>
          <button
            onClick={() => navigate("/demo")}
            className="text-xs text-amber-500 hover:text-amber-400 transition-colors font-medium"
          >
            Try the Demo →
          </button>
        </div>
      </footer>
    </div>
  );
}
