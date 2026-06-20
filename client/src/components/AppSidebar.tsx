import { useRouter } from "../router";
import type { AppRoute } from "../router";

interface NavItem {
  label: string;
  route: AppRoute;
  icon: React.ReactNode;
}

function BarChartIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m8 0V9a2 2 0 00-2-2H9a2 2 0 012 2v10m6 0v-3a2 2 0 00-2-2h-2a2 2 0 00-2 2v3m6 0h-6" />
    </svg>
  );
}

function LayoutIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { label: "Analyze Project", route: "/demo",     icon: <BarChartIcon /> },
  { label: "System Overview", route: "/overview", icon: <LayoutIcon /> },
];

export function AppSidebar() {
  const { pathname, navigate } = useRouter();

  return (
    <aside className="w-56 shrink-0 bg-[#0b0d1a] flex flex-col border-r border-white/[0.08] min-h-screen">
      {/* Wordmark */}
      <div className="px-5 py-5 border-b border-white/[0.08]">
        <button
          onClick={() => navigate("/")}
          className="text-left group"
        >
          <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5 group-hover:text-slate-400 transition-colors">
            FAIR <span className="text-amber-500">TRAZE</span> AI
          </span>
          <span className="block text-[10px] text-slate-600 group-hover:text-slate-500 transition-colors">
            Contribution Fairness
          </span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.route;
          return (
            <button
              key={item.route}
              onClick={() => navigate(item.route)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left ${
                isActive
                  ? "bg-amber-400/10 text-amber-400 font-medium"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <span className={isActive ? "text-amber-400" : "text-slate-500"}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer: back to landing */}
      <div className="px-3 py-4 border-t border-white/[0.08]">
        <button
          onClick={() => navigate("/")}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-600 hover:text-slate-400 hover:bg-white/5 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </button>
      </div>
    </aside>
  );
}
