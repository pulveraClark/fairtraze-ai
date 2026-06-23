import { useState } from "react";
import { AppTopBar } from "../components/AppTopBar";
import { parseClassLabel } from "../components/ClassCard";
import { getStudentEnrollment } from "../data/sampleStudentData";
import { useRouter } from "../router";

// ── FairTraze Docs authorship palette ────────────────────────────────────────
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

const HEALTH_BADGE: Record<string, string> = {
  "Healthy":       "text-emerald-700 bg-emerald-50 border-emerald-200",
  "Moderate Risk": "text-amber-700 bg-amber-50 border-amber-200",
  "High Risk":     "text-red-700 bg-red-50 border-red-200",
};

type Tab = "contribution" | "document";

const FLAG_DESCRIPTIONS: Record<string, string> = {
  "deadline-driven": "A high proportion of your commits were recorded in the final third of the project timeline. This pattern may indicate delayed contribution.",
  "free-rider":      "Your contribution share is below half the equal share for this team.",
  "inactive":        "No recorded activity was found in the analyzed period.",
  "overload":        "Your contribution share significantly exceeds the equal share, suggesting an uneven workload distribution.",
};

interface Props {
  classCode: string;
}

export function StudentClassPage({ classCode }: Props) {
  const { navigate } = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("contribution");

  const enrollment = getStudentEnrollment(classCode);

  if (!enrollment) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <AppTopBar />
        <main className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Class not found.
        </main>
      </div>
    );
  }

  const { subjectName } = parseClassLabel(enrollment.assignmentLabel);
  const { contribution } = enrollment;
  const mySharePct    = (contribution.share    * 100).toFixed(0);
  const equalSharePct = (contribution.equalShare * 100).toFixed(0);
  const giniLabel = contribution.gini < 0.2 ? "Healthy" : contribution.gini < 0.4 ? "Moderate Risk" : "High Risk";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      {/* Page header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <button
              onClick={() => navigate("/student")}
              className="shrink-0 text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium"
            >
              Dashboard
            </button>
            <span className="text-slate-300 text-xs shrink-0">›</span>
            <span className="shrink-0 text-xs font-mono font-medium text-slate-400">{classCode}</span>
            <span className="text-slate-300 text-xs shrink-0">›</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-semibold text-slate-800 truncate">{enrollment.assignmentTitle}</h1>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 tracking-wide uppercase shrink-0">
                  {enrollment.sourceType}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {subjectName && <span className="mr-1">{subjectName} ·</span>}
                {enrollment.groupName} · Deadline: {enrollment.deadline}
              </p>
            </div>
          </div>
          <span className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${HEALTH_BADGE[enrollment.teamHealth]}`}>
            {enrollment.teamHealth}
          </span>
        </div>

        {/* Tab bar */}
        <div className="max-w-5xl mx-auto px-6 sm:px-8 flex border-t border-slate-100">
          {(["contribution", "document"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab === "contribution" ? "My Contribution" : (
                <>
                  Document
                  <span className="ml-1.5 text-[9px] font-bold text-violet-500 bg-violet-50 border border-violet-200 rounded px-1 py-0.5 normal-case tracking-normal">
                    Preview
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 sm:px-8 py-8">

        {/* ── My Contribution tab ─────────────────────────────────────────────── */}
        {activeTab === "contribution" && (
          <div className="space-y-6">

            {/* Share overview */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Your contribution share</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {enrollment.groupName} · {enrollment.projectName} · {contribution.memberCount} members
                  </p>
                </div>
                <span className="text-3xl font-bold text-indigo-600">{mySharePct}%</span>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-500">Your share</span>
                  <span className="font-semibold text-slate-700">{mySharePct}%</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative">
                  <div
                    className="h-full rounded-full bg-indigo-400 transition-all"
                    style={{ width: `${contribution.share * 100}%` }}
                  />
                  {/* Equal share marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-slate-500/60"
                    style={{ left: `${contribution.equalShare * 100}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Equal share for {contribution.memberCount} members = {equalSharePct}%
                  {contribution.share >= contribution.equalShare
                    ? " · Your share is at or above the equal share."
                    : " · Your share is below the equal share."}
                  {" "}The marker line shows the equal share.
                </p>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { label: "Commits",       value: String(contribution.commits) },
                { label: "Active Days",   value: String(contribution.activeDays) },
                { label: "Lines Added",   value: contribution.linesAdded.toLocaleString() },
                { label: "Lines Deleted", value: contribution.linesDeleted.toLocaleString() },
              ] as const).map(({ label, value }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-xl px-4 py-4 text-center">
                  <p className="text-xl font-bold text-slate-800">{value}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Team context */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Team Overview</h3>
              <div className="flex items-start gap-6 flex-wrap">
                <div>
                  <p className="text-[11px] text-slate-400 mb-1.5">Team Health</p>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${HEALTH_BADGE[enrollment.teamHealth]}`}>
                    {enrollment.teamHealth}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 mb-1.5">Contribution Gini</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-700">{contribution.gini.toFixed(2)}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${HEALTH_BADGE[giniLabel]}`}>
                      {giniLabel}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 mb-1.5">Last Analyzed</p>
                  <p className="text-sm font-medium text-slate-700">{enrollment.lastAnalyzed}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                The Gini coefficient measures contribution inequality across the team. Below 0.2 is Healthy; 0.2–0.4 is Moderate Risk; above 0.4 is High Risk. Only aggregate team data is shown here — individual teammates' scores are not exposed in this view.
              </p>
            </div>

            {/* Your flags */}
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Your Flags</h3>
              {contribution.flags.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-400 text-center">
                  No flags on your contributions.
                </div>
              ) : (
                <div className="space-y-3">
                  {contribution.flags.map((flag) => (
                    <div key={flag} className="bg-white border border-yellow-200 rounded-xl p-5">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 w-7 h-7 rounded-full bg-yellow-100 flex items-center justify-center mt-0.5">
                          <svg className="w-3.5 h-3.5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[11px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-0.5">
                              {flag}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 leading-relaxed">
                            {FLAG_DESCRIPTIONS[flag] ?? "A flag has been raised on your contribution pattern."}
                          </p>
                          <p className="text-xs text-slate-400 mt-1.5">
                            This flag is visible to your instructor. You may submit a note to provide context.
                          </p>

                          {/* Flag for review — disabled preview */}
                          <div className="mt-4 space-y-2">
                            <textarea
                              disabled
                              placeholder="Explain context for your instructor (e.g. I was working offline and pushed at the end)…"
                              rows={2}
                              className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-400 placeholder-slate-300 resize-none cursor-not-allowed"
                            />
                            <div className="flex items-center gap-3 flex-wrap">
                              <button
                                disabled
                                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-100 text-indigo-400 text-xs font-semibold cursor-not-allowed border border-indigo-200"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                                </svg>
                                Flag for review / Add a note
                              </button>
                              <span className="text-[11px] text-slate-400">Coming soon</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── Document tab (FairTraze Docs preview) ────────────────────────────── */}
        {activeTab === "document" && (
          <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">FairTraze Docs</h2>
              <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">
                Preview
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Collaborative editor — document contributions recorded per author
              </span>
            </div>

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
                <span className="text-[11px] text-slate-400">The FairTraze Docs editor captures writing contributions alongside GitHub activity.</span>
              </div>
            </div>
          </div>
        )}

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
