import { AppTopBar } from "../components/AppTopBar";
import { SystemOverview } from "../components/SystemOverview";

export function OverviewPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      {/* Page header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-4">
          <h1 className="text-sm font-semibold text-slate-800">System Overview</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Architecture, pipeline phases, and designed workflow
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
