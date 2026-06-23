const IMPLEMENTED_PHASES = [
  {
    num: 1,
    name: "Data Collection",
    desc: "Fetches per-contributor commit history, additions, and deletions from the GitHub REST API via Octokit. Handles pagination and rate limiting.",
  },
  {
    num: 2,
    name: "Data Processing",
    desc: "Normalises raw GitHub activity into structured member records, resolving GitHub logins to student names and filling zero-activity entries for absent members.",
  },
  {
    num: 3,
    name: "Contribution Profiling",
    desc: "Computes weighted contribution scores per member (commits 40 %, churn 40 %, active days 20 %) and derives relative contribution shares across the team.",
  },
  {
    num: 4,
    name: "AI-Assisted Analysis",
    desc: "Passes the fully-computed TeamReport JSON to Google Gemini, which writes a plain-language fairness narrative. The AI explains numbers — it never computes or changes them.",
  },
  {
    num: 5,
    name: "Participation Imbalance Detection",
    desc: "Flags each member for detected patterns (inactive, free-rider, overload, deadline-driven) using deterministic thresholds. Computes the Gini coefficient across contribution shares.",
  },
  {
    num: 6,
    name: "Explainable Fairness Reporting",
    desc: "Assembles the final report: health badge (Healthy / Moderate Risk / High Risk), scored member table, contribution chart, and the AI narrative — all saved to the database.",
  },
];

const FUTURE_MODULES = [
  {
    name: "FAIR TRAZE Collaborative Editor",
    badge: "Coming soon",
    desc: "A built-in writing environment (TipTap + Yjs) that records per-user, timestamped collaboration traces — text inserted, deleted, comments, and suggestions. Blended with GitHub data so documentary and technical contributions are both scored: combinedShare = wGitHub × githubShare + wEditor × editorShare (default 50/50, instructor-configurable).",
  },
  {
    name: "Multi-role Access Control",
    badge: "Coming soon",
    desc: "Distinct instructor, group leader, student, and admin roles with scoped views and permissions.",
  },
  {
    name: "Real-time Participation Alerts",
    badge: "Coming soon",
    desc: "Proactive notifications when a member's activity falls below configurable thresholds during a project sprint.",
  },
  {
    name: "Institutional Analytics Dashboard",
    badge: "Coming soon",
    desc: "Aggregate fairness metrics across all projects and cohorts, enabling programme-level instructor and admin views.",
  },
  {
    name: "Project Join Codes & Team Management",
    badge: "Coming soon",
    desc: "Self-service project creation, join codes for students, and role assignment without admin intervention.",
  },
];

export function SystemOverview() {
  return (
    <div className="space-y-8">
      {/* I/O banner */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-5">System Input → Process → Output</h2>
        <div className="flex items-center gap-3 flex-wrap justify-center text-sm">
          <div className="flex flex-col gap-2 w-44">
            <div className="flex flex-col items-center gap-1 text-center">
              <div className="rounded-lg bg-slate-100 border border-slate-200 px-4 py-3 w-full font-medium text-slate-700">
                GitHub Repository
              </div>
              <span className="text-xs text-emerald-600 font-medium">✓ Live in this prototype</span>
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <div className="rounded-lg bg-slate-50 border border-dashed border-slate-300 px-4 py-3 w-full font-medium text-slate-400">
                Collaborative Editor
              </div>
              <span className="text-xs text-amber-500 font-medium">Coming soon</span>
            </div>
          </div>

          <div className="text-slate-300 text-xl font-thin select-none">→</div>

          <div className="flex flex-col items-center gap-1.5 text-center w-48">
            <div className="rounded-lg bg-indigo-600 px-4 py-3 w-full font-semibold text-white">
              Analysis Engine
            </div>
            <span className="text-xs text-slate-400">Collection → Profiling → AI → Imbalance Detection</span>
          </div>

          <div className="text-slate-300 text-xl font-thin select-none">→</div>

          <div className="flex flex-col items-center gap-1.5 text-center w-44">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 w-full font-medium text-emerald-800">
              Explainable Fairness Report
            </div>
            <span className="text-xs text-slate-400">Scored members · Flags · Gini · AI narrative</span>
          </div>
        </div>
      </div>

      {/* Six-phase pipeline */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Analysis Pipeline — Fully Implemented</h2>
          <span className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 inline-block" />
              Implemented in this prototype
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300 inline-block" />
              Designed, not yet built
            </span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {IMPLEMENTED_PHASES.map((phase) => (
            <div
              key={phase.num}
              className="rounded-lg bg-indigo-50 border border-indigo-200 p-4 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-mono text-indigo-400 block">Step {phase.num}</span>
                  <span className="text-sm font-semibold text-indigo-900">{phase.name}</span>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  ✓ Built
                </span>
              </div>
              <p className="text-xs text-indigo-700 leading-relaxed">{phase.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Setup & Roles */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Setup &amp; Responsibilities</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700">
            Designed — seeded in this prototype
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          The designed workflow distributes setup so an instructor with many groups is not a data-entry bottleneck. This prototype seeds the roster directly; the role-based flow below is the proposed design.
        </p>

        {/* Role flow */}
        <div className="flex items-start gap-2 flex-wrap justify-center text-sm mb-6">
          {/* Instructor — create */}
          <div className="flex flex-col items-center gap-1.5 text-center w-36">
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2.5 w-full">
              <p className="text-xs font-mono text-indigo-400 mb-0.5">Instructor</p>
              <p className="text-xs font-semibold text-indigo-900 leading-snug">Creates assignment &amp; shares join code</p>
            </div>
          </div>

          <div className="text-slate-300 text-xl font-thin select-none mt-4">→</div>

          {/* Group Leader */}
          <div className="flex flex-col items-center gap-1.5 text-center w-36">
            <div className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-2.5 w-full">
              <p className="text-xs font-mono text-slate-400 mb-0.5">Group Leader</p>
              <p className="text-xs font-semibold text-slate-700 leading-snug">Creates group &amp; connects GitHub repo</p>
            </div>
          </div>

          <div className="text-slate-300 text-xl font-thin select-none mt-4">→</div>

          {/* Members */}
          <div className="flex flex-col items-center gap-1.5 text-center w-36">
            <div className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-2.5 w-full">
              <p className="text-xs font-mono text-slate-400 mb-0.5">Each Member</p>
              <p className="text-xs font-semibold text-slate-700 leading-snug">Joins via code &amp; self-registers their GitHub username</p>
            </div>
          </div>

          <div className="text-slate-300 text-xl font-thin select-none mt-4">→</div>

          {/* Instructor — oversee */}
          <div className="flex flex-col items-center gap-1.5 text-center w-36">
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2.5 w-full">
              <p className="text-xs font-mono text-indigo-400 mb-0.5">Instructor</p>
              <p className="text-xs font-semibold text-indigo-900 leading-snug">Oversees roster, locks before grading</p>
            </div>
          </div>
        </div>

        {/* Integrity safeguards */}
        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-600 mb-2">Integrity safeguards</p>
          <ul className="space-y-1.5 text-xs text-slate-500">
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 mt-px">·</span>
              <span><span className="font-medium text-slate-700">Members self-register their own usernames</span> — the person most accurate about their own identity confirms it, making substitution harder.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 mt-px">·</span>
              <span><span className="font-medium text-slate-700">Instructor oversight and roster lock</span> — the instructor reviews the final roster and can lock it before analysis, preventing last-minute changes.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 mt-px">·</span>
              <span><span className="font-medium text-slate-700">Unmatched contributors surfaced automatically</span> — any GitHub login that contributed to the repo but is not in the roster is flagged in the report, making a missing or mis-mapped member immediately visible.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Future modules */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Future Modules</h2>
        <p className="text-xs text-slate-400 mb-4">
          These modules are designed as part of the full FAIR TRAZE AI system but are not implemented in this prototype.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FUTURE_MODULES.map((m) => (
            <div
              key={m.name}
              className="rounded-lg bg-slate-50 border border-slate-200 p-4 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-slate-600">{m.name}</span>
                <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${m.badge === "Coming soon" ? "bg-indigo-50 border border-indigo-200 text-indigo-600" : "bg-slate-100 border border-slate-200 text-slate-500"}`}>
                  {m.badge}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scope legend */}
      <div className="flex items-center gap-6 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 flex-wrap">
        <span className="font-medium text-slate-600">Prototype scope:</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-indigo-500 inline-block" />
          Implemented — GitHub repository analysis (all 6 phases)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-300 inline-block" />
          Designed, not yet built — Collaborative Editor · Multi-role access · Admin analytics
        </span>
      </div>
    </div>
  );
}
