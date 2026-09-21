import { AppTopBar } from "../components/AppTopBar";
import { SystemOverview } from "../components/SystemOverview";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import type { AppRoute } from "../router";

function roleHome(role: string | undefined): { route: AppRoute; label: string } {
  if (role === "ADMIN") return { route: "/admin", label: "Admin" };
  if (role === "STUDENT") return { route: "/student", label: "Dashboard" };
  if (role === "INSTRUCTOR") return { route: "/dashboard", label: "Dashboard" };
  return { route: "/", label: "Home" };
}

export function OverviewPage() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const { route: backRoute, label: backLabel } = roleHome(user?.systemRole);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      {/* Page header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-4">
          <button
            onClick={() => navigate(backRoute)}
            className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors mb-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to {backLabel}
          </button>
          <h1 className="text-xl font-bold text-slate-900">System Overview</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            What FAIR TRAZE AI does and how the system works
          </p>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 sm:px-8 py-8">
        <SystemOverview />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="px-6 sm:px-8 py-3 text-xs text-slate-400 text-center">
          Outputs are evidence to support instructor judgment — they do not constitute grades or
          final assessments.
        </div>
      </footer>
    </div>
  );
}
