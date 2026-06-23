const DOC_AUTHORS = [
  { name: "Member A", bg: "#ede9fe", dot: "#7c3aed", words: 78, pct: 32 },
  { name: "Member B", bg: "#d1fae5", dot: "#059669", words: 76, pct: 31 },
  { name: "Member C", bg: "#fef3c7", dot: "#d97706", words: 64, pct: 26 },
  { name: "Member D", bg: "#ffe4e6", dot: "#dc2626", words: 27, pct: 11 },
];

function AuthSeg({ authorIdx, children }: { authorIdx: number; children: string }) {
  return (
    <span
      style={{ backgroundColor: DOC_AUTHORS[authorIdx].bg }}
      className="rounded-[2px] px-0.5"
      title={`Written by ${DOC_AUTHORS[authorIdx].name}`}
    >
      {children}
    </span>
  );
}

export function FairTrazeDocsPreview() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-slate-100 bg-slate-50 overflow-x-auto pointer-events-none select-none">
        {(["B", "I", "U"] as const).map((fmt, i) => (
          <button
            key={fmt}
            className="w-7 h-7 rounded flex items-center justify-center text-sm text-slate-400"
            style={{
              fontWeight:     i === 0 ? "bold"      : "normal",
              fontStyle:      i === 1 ? "italic"    : "normal",
              textDecoration: i === 2 ? "underline" : "none",
            }}
          >
            {fmt}
          </button>
        ))}
        <span className="w-px h-4 bg-slate-200 mx-1.5" />
        {(["H1", "H2"] as const).map((h) => (
          <button key={h} className="px-1.5 h-7 rounded flex items-center justify-center text-[11px] font-semibold text-slate-400">
            {h}
          </button>
        ))}
        <span className="w-px h-4 bg-slate-200 mx-1.5" />
        <button className="w-7 h-7 rounded flex items-center justify-center text-slate-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        </button>
        <button className="w-7 h-7 rounded flex items-center justify-center text-slate-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01" />
          </svg>
        </button>
        <span className="w-px h-4 bg-slate-200 mx-1.5" />
        <button className="w-7 h-7 rounded flex items-center justify-center text-slate-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </button>
        <span className="w-px h-4 bg-slate-200 mx-1.5" />
        <button className="w-7 h-7 rounded flex items-center justify-center text-slate-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>
        <button className="w-7 h-7 rounded flex items-center justify-center text-slate-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </button>
      </div>

      {/* Editor body + contributor panel */}
      <div className="flex divide-x divide-slate-100">
        <div className="flex-1 px-8 py-6 overflow-y-auto max-h-[28rem] text-sm leading-relaxed text-slate-700 min-w-0">
          <h2 className="text-base font-bold text-slate-900 mb-4">
            <AuthSeg authorIdx={0}>FairTraze AI — Technical Design Document</AuthSeg>
          </h2>
          <p className="mb-3">
            <AuthSeg authorIdx={0}>
              This document describes the architecture and design of FairTraze AI, a system that helps instructors fairly assess individual contributions in academic group projects by analysing digital collaboration traces.
            </AuthSeg>
          </p>
          <p className="mb-3">
            <AuthSeg authorIdx={1}>
              The backend is built with Express and TypeScript. Data is stored in SQLite through Prisma ORM. Routes are organised by domain — auth, projects, and analyze — and all request bodies are validated with Zod schemas to ensure type safety at the API boundary.
            </AuthSeg>
          </p>
          <p className="mb-3">
            <AuthSeg authorIdx={2}>
              Users authenticate via email and password. Passwords are hashed with bcryptjs before storage. Three middleware layers — authenticateToken, requireAuth, and requireRole — protect all sensitive routes from unauthorised access.
            </AuthSeg>
          </p>
          <p className="mb-3">
            <AuthSeg authorIdx={0}>
              All contribution scores are computed deterministically in the shared scoring module. The AI component generates plain-language explanations of pre-computed numbers only — it never calculates, modifies, or overrides any score.
            </AuthSeg>
          </p>
          <p className="mb-3">
            <AuthSeg authorIdx={3}>
              A planned second data source is the FairTraze Collaborative Editor — a real-time TipTap + Yjs environment that captures per-user timestamped edits for contribution analysis.
            </AuthSeg>
          </p>
          <p className="mb-3">
            <AuthSeg authorIdx={1}>
              The Gini coefficient measures contribution inequality within a team. A value below 0.2 is Healthy; 0.2 to 0.4 is Moderate Risk; above 0.4 is High Risk and triggers detailed flag analysis.
            </AuthSeg>
          </p>
          <p>
            <AuthSeg authorIdx={2}>
              Future phases add institutional hierarchy, Google OAuth, student dashboards, and blended GitHub + editor scoring. All flag thresholds are configurable per assignment.
            </AuthSeg>
          </p>
        </div>

        {/* Contributor panel */}
        <div className="hidden sm:flex flex-col w-48 px-4 py-5 gap-3.5 shrink-0">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Authorship</p>
          {DOC_AUTHORS.map((a) => (
            <div key={a.name}>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.dot }} />
                <span className="text-xs font-medium text-slate-700 flex-1 truncate">{a.name}</span>
                <span className="text-[11px] font-semibold text-slate-500">{a.pct}%</span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${a.pct}%`, backgroundColor: a.dot }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">{a.words} words</p>
            </div>
          ))}
          <div className="border-t border-slate-100 pt-3 mt-auto">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Highlights show who wrote each passage. Authorship is recorded per character in real time.
            </p>
          </div>
        </div>
      </div>

      {/* Footer bar */}
      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center gap-2">
        <span className="text-[11px] text-violet-600 font-medium">Read-only preview</span>
        <span className="text-slate-300 text-xs">·</span>
        <span className="text-[11px] text-slate-400">FairTraze Docs support coming soon. The editor will capture writing contributions alongside GitHub activity.</span>
      </div>
    </div>
  );
}
