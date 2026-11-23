import { SystemOverview } from "../components/SystemOverview";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { roleHome } from "../lib/roleHome";

export function OverviewPage() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const { route: backRoute, label: backLabel } = roleHome(user?.systemRole);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4">
          <button
            onClick={() => navigate(backRoute)}
            className="inline-flex items-center gap-1 min-h-9 text-sm text-slate-600 hover:text-slate-900 transition-colors mb-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to {backLabel}
          </button>
          <h1 className="text-xl font-semibold text-slate-900">System Overview</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            What FAIR TRAZE AI does and how the system works
          </p>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6">
        <SystemOverview />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="px-4 sm:px-8 py-3 text-xs text-slate-600 text-center">
          Outputs are evidence to support instructor judgment — they do not constitute grades or
          final assessments.{" "}
          <button
            type="button"
            onClick={() => navigate("/privacy")}
            className="font-medium text-indigo-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Privacy Notice
          </button>
        </div>
      </footer>
    </div>
  );
}
