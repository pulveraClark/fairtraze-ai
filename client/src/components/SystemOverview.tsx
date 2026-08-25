import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                      */
/* ------------------------------------------------------------------ */
function Live() {
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700">
      ✓ Live
    </span>
  );
}
function SectionHeader({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-semibold text-slate-700 mb-4">{children}</h2>;
}

/* ------------------------------------------------------------------ */
/*  Section 1 — What FAIR TRAZE AI is                                   */
/* ------------------------------------------------------------------ */
function WhatItIs() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <SectionHeader>What FAIR TRAZE AI Is</SectionHeader>
      <p className="text-xs text-slate-600 leading-relaxed mb-4">
        FAIR TRAZE AI helps instructors fairly assess individual contributions inside academic group
        projects. It collects digital collaboration traces from GitHub and the FairTraze
        Collaborative Editor, scores each member's contribution deterministically across both
        sources, detects participation imbalances, and produces an explainable, evidence-based
        fairness report — so instructors can review individual work with confidence.
      </p>

      {/* Core principle callout */}
      <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-5 py-4 flex items-start gap-3">
        <span className="text-indigo-400 text-lg leading-none mt-0.5">⚖</span>
        <div>
          <p className="text-xs font-semibold text-indigo-900 mb-1">
            The math scores. The AI explains. The instructor decides.
          </p>
          <p className="text-xs text-indigo-700 leading-relaxed">
            All contribution scores, participation flags, the Gini coefficient, and the team-health
            label are computed deterministically in code. Google Gemini only writes a plain-language
            narrative explaining those already-computed numbers, citing specific evidence — it never
            computes, changes, or overrides a score, and never assigns a grade. The instructor
            reviews the report as evidence and retains final authority.
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-3">
        FAIR TRAZE AI supports instructor judgment. It never replaces it and never assigns grades.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 2 — The two data sources                                    */
/* ------------------------------------------------------------------ */
function DataSources() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <SectionHeader>Two Data Sources</SectionHeader>
      <p className="text-xs text-slate-500 leading-relaxed mb-5">
        GitHub captures code. The FairTraze Collaborative Editor captures writing and documentation.
        A project can be analyzed on either source alone or on both combined — this matters most for
        teams where some members are primarily documentation contributors who would otherwise appear
        invisible in GitHub data alone.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-indigo-900">GitHub Repository</span>
            <Live />
          </div>
          <p className="text-xs text-indigo-700 leading-relaxed">
            Per-member commit history fetched via the GitHub REST API. Tracks commits, additions,
            deletions, active days, and file-type context to produce a deterministic GitHub
            contribution share for each member.
          </p>
        </div>

        <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-indigo-900">FairTraze Collaborative Editor</span>
            <Live />
          </div>
          <p className="text-xs text-indigo-700 leading-relaxed">
            A writing environment built directly into FAIR TRAZE AI that records per-user,
            timestamped collaboration traces — text inserted and deleted, edit sessions, and
            edit-type classification — to produce an independent editor contribution share.
          </p>
        </div>
      </div>

      {/* Combined scoring formula */}
      <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
        <p className="text-xs font-semibold text-slate-600 mb-1">Combined scoring (when both sources are active)</p>
        <p className="text-xs font-mono text-slate-700 mb-1">
          combinedShare = w<sub>GitHub</sub> × githubShare + w<sub>Editor</sub> × editorShare
        </p>
        <p className="text-xs text-slate-400">
          Default blend: 50 / 50. Instructor-configurable per assignment. The math stays
          deterministic; the AI only explains the result.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 3 — How scoring works, at a glance                          */
/* ------------------------------------------------------------------ */
function ScoringSection() {
  const flags = [
    { name: "Inactive", desc: "No recorded activity in the analysis window." },
    { name: "Free-rider", desc: "Contribution share well below an equal split." },
    { name: "Overload", desc: "One member carrying a disproportionate share of the work." },
    { name: "Deadline-driven", desc: "Activity concentrated near the project deadline." },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <SectionHeader>How Scoring Works, at a Glance</SectionHeader>
      <p className="text-xs text-slate-500 leading-relaxed mb-4">
        Each member's contribution share blends how much they did, how substantial it was, and how
        consistently they were active — commit/edit volume, a significance weighting that discounts
        low-value changes (formatting, generated files, self-churn), and active participation days.
        The result is compared against an equal split to surface participation imbalance.
      </p>

      <div className="mb-5">
        <p className="text-xs font-semibold text-slate-600 mb-2">Participation flags</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {flags.map((f) => (
            <div key={f.name} className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-800">{f.name}</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <p className="text-xs font-semibold text-slate-600 mb-2">Team health — Gini coefficient</p>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: "Healthy", range: "Gini < 0.2", color: "bg-emerald-50 border-emerald-200 text-emerald-800" },
            { label: "Moderate Risk", range: "Gini 0.2 – 0.4", color: "bg-amber-50 border-amber-200 text-amber-800" },
            { label: "High Risk", range: "Gini ≥ 0.4", color: "bg-red-50 border-red-200 text-red-800" },
          ].map((g) => (
            <div key={g.label} className={`rounded-lg border px-3 py-2 ${g.color}`}>
              <p className="text-xs font-semibold">{g.label}</p>
              <p className="text-xs opacity-80 mt-0.5">{g.range}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        All weights and flag thresholds shown are documented defaults, configurable per assignment
        in Scoring Settings. Full formulas and per-member breakdowns are available on each report.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 4 — The three roles                                        */
/* ------------------------------------------------------------------ */
function SystemRoles() {
  const roles = [
    {
      title: "Instructor",
      color: "indigo",
      items: [
        "Creates class sections and assignments; generates join codes",
        "Manages the class roster and can reassign group leaders",
        "Runs analysis and views the full fairness report for any group",
        "Receives at-risk alerts when member activity is low",
        "Reviews student disputes and resolves them with a written outcome",
        "Retains final authority — reports are evidence, not grades",
      ],
    },
    {
      title: "Student",
      color: "slate",
      items: [
        "Enrolls in a class using the instructor's join code",
        "Creates or joins a group per assignment (first student in becomes leader)",
        "Views their own contribution report and flags — cannot see other members' individual scores",
        "Can flag a finding for review with a free-text note (dispute path to the instructor)",
      ],
    },
    {
      title: "Admin",
      color: "violet",
      items: [
        "Manages all user accounts: create, edit, promote, deactivate",
        "Assigns system roles (Admin, Instructor, Student)",
        "Views the full audit log of system events",
        "Oversight of all classes, assignments, and groups system-wide",
      ],
    },
  ];

  const colorMap: Record<string, { card: string; dot: string; title: string }> = {
    indigo: { card: "bg-indigo-50 border-indigo-200", dot: "bg-indigo-400", title: "text-indigo-900" },
    slate:  { card: "bg-slate-50 border-slate-200",   dot: "bg-slate-400",  title: "text-slate-800"  },
    violet: { card: "bg-violet-50 border-violet-200", dot: "bg-violet-400", title: "text-violet-900" },
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <SectionHeader>The Three Roles</SectionHeader>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {roles.map((r) => {
          const c = colorMap[r.color]!;
          return (
            <div key={r.title} className={`rounded-lg border p-4 flex flex-col gap-2 ${c.card}`}>
              <p className={`text-sm font-semibold ${c.title}`}>{r.title}</p>
              <ul className="space-y-1.5 mt-1">
                {r.items.map((item) => (
                  <li key={item} className="flex items-start gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${c.dot} mt-1.5 shrink-0`} />
                    <span className="text-xs text-slate-600 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 5 — Fairness and privacy commitments                        */
/* ------------------------------------------------------------------ */
function PrivacySection() {
  const commitments = [
    {
      title: "Decision-support, not auto-grading",
      body: "Reports are evidence for the instructor's review. No score, flag, or narrative constitutes a grade or final assessment. Instructor judgment is final.",
    },
    {
      title: "Scoped student visibility",
      body: "Students see their own contribution report and flags. They cannot see other members' individual scores or raw data. The full team view is instructor-only.",
    },
    {
      title: "Leadership carries no advantage",
      body: "The group leader is a structural role only — whoever first created the group. It grants zero contribution credit. The leader is scored on their actual recorded traces exactly like every other member, and receives the same flags if their share falls below threshold.",
    },
    {
      title: "Configurable, transparent weights",
      body: "Scoring weights and flag thresholds are documented defaults, not hidden magic numbers. Instructors can view and adjust them per assignment in Scoring Settings.",
    },
    {
      title: "Dispute path",
      body: "Students have one action: flag a finding for review with a note. This gives members a voice for contributions the system cannot see — offline collaboration, verbal discussions, manual testing.",
    },
    {
      title: "Roles never change scores",
      body: "Functional roles (e.g. Developer, Documentation Lead) add context only. The scoring formula is role-agnostic — a mis-assigned role can never shield a member from a flag.",
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <SectionHeader>Fairness and Privacy Commitments</SectionHeader>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {commitments.map((item) => (
          <div key={item.title} className="rounded-lg bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-700 mb-1.5">{item.title}</p>
            <p className="text-xs text-slate-500 leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 6 — Where to go next (role-aware)                           */
/* ------------------------------------------------------------------ */
function WhereToGoNext() {
  const { user, loading } = useAuth();
  const { navigate } = useRouter();

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <SectionHeader>Where to Go Next</SectionHeader>
        <p className="text-xs text-slate-400">Loading…</p>
      </div>
    );
  }

  let heading = "Sign in to get started";
  let body = "Create an account or sign in to enroll in a class, join a group, or manage assignments.";
  let primaryLabel = "Sign In";
  let primaryTarget = "/login";
  let secondary: { label: string; target: string } | null = { label: "Register", target: "/register" };

  if (user?.systemRole === "STUDENT") {
    heading = "Go to your classes";
    body = "View your groups, your own contribution report, and flag any finding for instructor review.";
    primaryLabel = "Go to My Classes";
    primaryTarget = "/student";
    secondary = null;
  } else if (user?.systemRole === "INSTRUCTOR") {
    heading = "Go to your dashboard";
    body = "Manage class sections and assignments, run analyses, and review fairness reports.";
    primaryLabel = "Go to Dashboard";
    primaryTarget = "/dashboard";
    secondary = null;
  } else if (user?.systemRole === "ADMIN") {
    heading = "Go to the admin panel";
    body = "Manage user accounts, system roles, and view the full audit log.";
    primaryLabel = "Go to Admin Panel";
    primaryTarget = "/admin";
    secondary = null;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <SectionHeader>Where to Go Next</SectionHeader>
      <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-900 mb-1">{heading}</p>
          <p className="text-xs text-indigo-700 leading-relaxed">{body}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {secondary && (
            <button
              onClick={() => navigate(secondary!.target)}
              className="text-xs font-medium text-indigo-700 border border-indigo-200 bg-white rounded-lg px-3 py-2 hover:bg-indigo-50 transition-colors"
            >
              {secondary.label}
            </button>
          )}
          <button
            onClick={() => navigate(primaryTarget)}
            className="text-xs font-medium text-white bg-indigo-600 rounded-lg px-3 py-2 hover:bg-indigo-500 transition-colors"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Root export                                                         */
/* ------------------------------------------------------------------ */
export function SystemOverview() {
  return (
    <div className="space-y-6">
      <WhatItIs />
      <DataSources />
      <ScoringSection />
      <SystemRoles />
      <PrivacySection />
      <WhereToGoNext />
    </div>
  );
}
