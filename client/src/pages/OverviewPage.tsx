import { AppSidebar } from "../components/AppSidebar";
import { SystemOverview } from "../components/SystemOverview";

export function OverviewPage() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <AppSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="px-8 py-3.5">
            <h1 className="text-sm font-semibold text-slate-800">System Overview</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Architecture, pipeline phases, and designed workflow
            </p>
          </div>
        </header>

        <main className="flex-1 px-8 py-8 max-w-5xl w-full mx-auto">
          <SystemOverview />
        </main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="px-8 py-3 text-xs text-slate-400 text-center">
            Outputs are evidence to support instructor judgment — they do not constitute grades or
            final assessments.
          </div>
        </footer>
      </div>
    </div>
  );
}
