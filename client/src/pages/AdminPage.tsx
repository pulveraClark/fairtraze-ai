import { useRouter } from "../router";
import { AppTopBar } from "../components/AppTopBar";

// ── Sample data — clearly labeled, not live ───────────────────────────────────
const INSTITUTION_COUNTS = [
  { label: "School",       value: 1,  color: "text-amber-600  bg-amber-50  border-amber-200"  },
  { label: "Departments",  value: 3,  color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  { label: "Instructors",  value: 12, color: "text-slate-700  bg-slate-50  border-slate-200"  },
  { label: "Classes",      value: 18, color: "text-slate-700  bg-slate-50  border-slate-200"  },
  { label: "Groups",       value: 47, color: "text-slate-700  bg-slate-50  border-slate-200"  },
  { label: "At-Risk",      value: 7,  color: "text-red-600    bg-red-50    border-red-200"    },
];

const AT_RISK_GROUPS = [
  { group: "Group 3",  code: "IT-ELEC 2",     health: "High Risk",     gini: 0.54, flags: 3 },
  { group: "Group 1",  code: "CC-APPSDEV22",  health: "Moderate Risk", gini: 0.31, flags: 1 },
  { group: "Group 7",  code: "CS-SE301",      health: "Moderate Risk", gini: 0.27, flags: 2 },
  { group: "Group 4",  code: "IT-IMDBSYS32",  health: "Moderate Risk", gini: 0.23, flags: 1 },
];

const GINI_BINS = [
  { range: "0.0–0.1", count: 8,  health: "healthy"  },
  { range: "0.1–0.2", count: 14, health: "healthy"  },
  { range: "0.2–0.3", count: 11, health: "moderate" },
  { range: "0.3–0.4", count: 7,  health: "moderate" },
  { range: "0.4–0.5", count: 5,  health: "high"     },
  { range: "0.5–0.6", count: 2,  health: "high"     },
];

const MAX_BIN = Math.max(...GINI_BINS.map((b) => b.count));

const HEALTH_BADGE: Record<string, string> = {
  "High Risk":     "text-red-700 bg-red-50 border-red-200",
  "Moderate Risk": "text-amber-700 bg-amber-50 border-amber-200",
};

const BIN_COLOR: Record<string, string> = {
  healthy:  "bg-emerald-400",
  moderate: "bg-amber-400",
  high:     "bg-red-400",
};

function SampleChip() {
  return (
    <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 normal-case tracking-normal align-middle">
      Sample data
    </span>
  );
}

function DisabledBtn({ children }: { children: React.ReactNode }) {
  return (
    <button
      disabled
      title="Coming soon"
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed border border-slate-200"
    >
      {children}
    </button>
  );
}

export function AdminPage() {
  const { navigate } = useRouter();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 sm:px-8 py-8 space-y-8">

        {/* Page heading */}
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Institution Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cross-class fairness trends and at-risk group summaries.
          </p>
        </div>

        {/* ── Count cards ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Summary <SampleChip />
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {INSTITUTION_COUNTS.map(({ label, value, color }) => (
              <div key={label} className={`bg-white border rounded-xl p-4 text-center ${color.split(" ").filter((c) => c.startsWith("border")).join(" ")}`}>
                <p className={`text-2xl font-bold ${color.split(" ")[0]}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Gini Distribution ──────────────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
              Fairness Distribution (Gini) <SampleChip />
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Distribution of team Gini coefficients across all 47 groups
            </p>

            <div className="flex items-end gap-2 h-32">
              {GINI_BINS.map((bin) => (
                <div key={bin.range} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-slate-500 font-medium">{bin.count}</span>
                  <div
                    className={`w-full rounded-t-sm ${BIN_COLOR[bin.health]} opacity-80`}
                    style={{ height: `${(bin.count / MAX_BIN) * 100}%` }}
                  />
                  <span className="text-[9px] text-slate-400 leading-tight text-center">{bin.range}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-100">
              {[
                { color: "bg-emerald-400", label: "Healthy (< 0.2)" },
                { color: "bg-amber-400",   label: "Moderate (0.2–0.4)" },
                { color: "bg-red-400",     label: "High Risk (≥ 0.4)" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span className={`w-2.5 h-2.5 rounded-sm ${color} opacity-80`} />
                  {label}
                </div>
              ))}
            </div>
          </section>

          {/* ── At-Risk Groups ─────────────────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
              At-Risk Groups <SampleChip />
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Groups with High or Moderate Risk team health across all classes
            </p>

            <div className="space-y-2">
              {AT_RISK_GROUPS.map((g) => (
                <div key={`${g.group}-${g.code}`} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-800">{g.group}</span>
                      <span className="text-[10px] font-mono text-indigo-600">{g.code}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${HEALTH_BADGE[g.health]}`}>
                        {g.health}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Gini {g.gini.toFixed(2)} · {g.flags} flag{g.flags !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <button
                    disabled
                    className="shrink-0 text-[11px] text-slate-300 cursor-not-allowed font-medium"
                    title="Coming soon"
                  >
                    View →
                  </button>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-400 mt-4">
              Showing 4 of 7 at-risk groups
            </p>
          </section>
        </div>

        {/* ── Hierarchy Management ────────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
            Hierarchy Management
          </h2>
          <p className="text-xs text-slate-400 mb-5">
            Create and manage institutions, departments, and instructors. Coming soon.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="border border-dashed border-slate-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-600 mb-1">Departments</p>
              <p className="text-xs text-slate-400 mb-3">Create or rename departments within the institution.</p>
              <DisabledBtn>Create Department</DisabledBtn>
            </div>
            <div className="border border-dashed border-slate-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-600 mb-1">Instructors</p>
              <p className="text-xs text-slate-400 mb-3">Invite instructors and assign them to departments.</p>
              <DisabledBtn>Invite Instructor</DisabledBtn>
            </div>
            <div className="border border-dashed border-slate-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-600 mb-1">Classes</p>
              <p className="text-xs text-slate-400 mb-3">View and manage all class sections across departments.</p>
              <DisabledBtn>Manage Classes</DisabledBtn>
            </div>
            <div className="border border-dashed border-slate-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-600 mb-1">Reports</p>
              <p className="text-xs text-slate-400 mb-3">Export aggregated fairness data across the institution.</p>
              <DisabledBtn>Export Reports</DisabledBtn>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 mt-4">
            All management actions are disabled in this preview.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="px-6 sm:px-8 py-3 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-400">
            Outputs support instructor judgment — they do not constitute grades or final assessments.
          </p>
          <button
            onClick={() => navigate("/overview")}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            System Overview →
          </button>
        </div>
      </footer>
    </div>
  );
}
