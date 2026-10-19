import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD } from "./ui/styles";
import {
  DEFAULT_WEIGHTS,
  FREE_RIDER_THRESHOLD,
  OVERLOAD_THRESHOLD,
  DEADLINE_DRIVEN_THRESHOLD,
  HEALTHY_GINI_THRESHOLD,
  MODERATE_RISK_GINI_THRESHOLD,
} from "@shared/scoring";
import { DOCUMENT_DEFAULT_WEIGHTS } from "@shared/documentScoring";
import { FILE_WEIGHTS } from "@shared/fileWeights";
import { COMMIT_IMPACT } from "@shared/commitClassifier";

// Every number on this page is read from the same constants the scoring engine uses
// (shared/src), so the overview cannot drift from the real defaults.
const pct = (n: number) => `${Math.round(n * 100)}%`;
const num = (n: number) => n.toFixed(2).replace(/0$/, "");

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                      */
/* ------------------------------------------------------------------ */
function Live() {
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-800">
      ✓ Live
    </span>
  );
}
function Section({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${CARD} p-4`}>
      <h2 className="text-lg font-semibold text-slate-900 mb-2">{title}</h2>
      {intro && <p className="text-sm text-slate-700 leading-relaxed mb-3">{intro}</p>}
      {children}
    </section>
  );
}
function Bullets({ items, dot }: { items: ReactNode[]; dot: string }) {
  return (
    <ul className="space-y-1.5 mt-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${dot} mt-1.5 shrink-0`} />
          <span className="text-sm text-slate-700 leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/*  1 — What FAIR TRAZE AI is                                           */
/* ------------------------------------------------------------------ */
function WhatItIs() {
  return (
    <Section title="What FAIR TRAZE AI is">
      <p className="text-sm text-slate-700 leading-relaxed mb-3">
        FAIR TRAZE AI helps instructors fairly assess individual contributions inside academic group
        projects. It collects digital collaboration traces from GitHub and the FairTraze
        Collaborative Editor, scores each member's contribution deterministically across both
        sources, detects participation imbalances, and produces an explainable, evidence-based
        fairness report.
      </p>
      <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4">
        <p className="text-sm font-semibold text-indigo-900 mb-1">
          The math scores. The AI explains. The instructor decides.
        </p>
        <p className="text-sm text-indigo-900 leading-relaxed">
          All contribution scores, participation flags, the Gini coefficient and the team-health
          label come from transparent formulas computed in code. Google Gemini only writes a
          plain-language narrative about those already-computed numbers, citing evidence. It never
          computes, changes or overrides a score, and never assigns a grade. The report is
          evidence; the instructor reviews it and retains final authority.
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  2 — How it works                                                    */
/* ------------------------------------------------------------------ */
function HowItWorks() {
  const steps = [
    { n: 1, title: "Set up", body: "The instructor creates a class section and a project (with an optional project brief) and shares the join code. Students form groups with it." },
    { n: 2, title: "Collect", body: "Activity is gathered from GitHub, the FairTraze Collaborative Editor, or both, depending on the project." },
    { n: 3, title: "Score", body: "Fixed formulas turn the activity into contribution shares, flags, a Gini coefficient and a team-health label." },
    { n: 4, title: "Explain and review", body: "Gemini explains the numbers in plain language. The instructor reviews the evidence and decides." },
  ];
  return (
    <Section title="How it works">
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {steps.map((s) => (
          <li key={s.n} className="rounded-lg bg-slate-50 border border-slate-200 p-4 h-full">
            <p className="text-sm font-semibold text-slate-900 mb-1">
              <span className="tabular-nums">{s.n}.</span> {s.title}
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="text-sm text-slate-700 leading-relaxed mt-3">
        <span className="font-semibold">Live analysis progress.</span> While an analysis runs, the
        instructor sees its real stages (collecting, calculating, saving), counts of contributors,
        commits and editors as they arrive, per-member counts and activity by day. No scores,
        flags or team-health label appear until the analysis has finished.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  3 — The two data sources                                            */
/* ------------------------------------------------------------------ */
function DataSources() {
  return (
    <Section
      title="Two data sources"
      intro="GitHub captures code. The FairTraze Collaborative Editor captures writing and documentation. A project can be analyzed on either source alone or on both combined, which matters most for teams where some members mainly write or research and would otherwise be invisible in GitHub data."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4 flex flex-col gap-2 h-full">
          <div className="flex items-start justify-between gap-2">
            <span className="text-base font-semibold text-indigo-900">GitHub repository</span>
            <Live />
          </div>
          <p className="text-sm text-indigo-900 leading-relaxed">
            Per-member commit history from the GitHub API: authored commits (merge commits
            excluded), lines added by file type, commit
            impact, self-churn and active days.
          </p>
        </div>

        <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4 flex flex-col gap-2 h-full">
          <div className="flex items-start justify-between gap-2">
            <span className="text-base font-semibold text-indigo-900">FairTraze Collaborative Editor</span>
            <Live />
          </div>
          <p className="text-sm text-indigo-900 leading-relaxed">
            A writing environment built into FAIR TRAZE AI (shown as FairTraze Docs) that records
            who wrote what and when. The main signal is text that survived editing, weighted by
            how substantial each edit was, alongside editing sessions and active days. It does
            not connect to Google Docs. Text imported from a .docx file is tracked as an import:
            it is credited to the member who uploaded it, with session credit estimated from the
            import volume and active days counting only the upload day, and the report discloses
            this on that member.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-800 mb-1">Combined scoring (when both sources are active)</p>
        <p className="text-sm font-mono text-slate-800 mb-1">
          combinedShare = w<sub>GitHub</sub> × githubShare + w<sub>Docs</sub> × editorShare
        </p>
        <p className="text-xs text-slate-600 leading-relaxed">
          Default blend 50 / 50; the instructor can adjust it per project in Scoring Settings. Each
          source is normalized on its own before blending, and flags use one merged timeline from
          both sources. The math stays deterministic; the AI only explains the result.
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  4 — How scoring works                                               */
/* ------------------------------------------------------------------ */
function ScoringSection() {
  const w = DEFAULT_WEIGHTS;
  const dw = DOCUMENT_DEFAULT_WEIGHTS;
  const flags = [
    {
      name: "Inactive",
      desc: "No activity recorded in the project's source: no commits (GitHub), no editing sessions (Editor), or neither (Combined).",
    },
    { name: "Free-rider", desc: `Contribution share below ${num(FREE_RIDER_THRESHOLD)}× an equal split.` },
    { name: "Overload", desc: `Contribution share above ${num(OVERLOAD_THRESHOLD)}× an equal split.` },
    {
      name: "Deadline-driven",
      desc: `More than ${pct(DEADLINE_DRIVEN_THRESHOLD)} of activity in the final third of the window. The window runs to the project deadline when one is set, otherwise to the observed activity span.`,
    },
  ];
  const bands = [
    { label: "Healthy", range: `Gini < ${num(HEALTHY_GINI_THRESHOLD)}`, color: "bg-emerald-50 border-emerald-200 text-emerald-900" },
    { label: "Moderate Risk", range: `Gini ${num(HEALTHY_GINI_THRESHOLD)} – ${num(MODERATE_RISK_GINI_THRESHOLD)}`, color: "bg-amber-50 border-amber-200 text-amber-900" },
    { label: "High Risk", range: `Gini ≥ ${num(MODERATE_RISK_GINI_THRESHOLD)}`, color: "bg-red-50 border-red-200 text-red-900" },
  ];

  return (
    <Section
      title="How scoring works"
      intro="Each member's contribution share blends how much they did, how substantial it was and how consistently they were active. The result is compared with an equal split to surface participation imbalance."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch mb-4">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 h-full">
          <p className="text-sm font-semibold text-slate-800 mb-1">GitHub</p>
          <p className="text-sm font-mono text-slate-800 leading-relaxed tabular-nums">
            share = {num(w.commits)} × commits + {num(w.lines)} × lines + {num(w.activeDays)} × active days
          </p>
          <p className="text-xs text-slate-600 mt-1">Commits use a log scale, so padding with tiny commits gains little.</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 h-full">
          <p className="text-sm font-semibold text-slate-800 mb-1">Editor</p>
          <p className="text-sm font-mono text-slate-800 leading-relaxed tabular-nums">
            share = {num(dw.retainedText)} × retained text + {num(dw.sessions)} × sessions + {num(dw.activeDays)} × active days
          </p>
          <p className="text-xs text-slate-600 mt-1">Retained text is text that survived editing, weighted by edit significance.</p>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-800 mb-2">Participation flags</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-stretch">
          {flags.map((f) => (
            <div key={f.name} className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 h-full">
              <p className="text-sm font-semibold text-amber-900">{f.name}</p>
              <p className="text-sm text-amber-900 mt-0.5 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-800 mb-2">Team health (Gini coefficient)</p>
        <div className="flex gap-2 flex-wrap">
          {bands.map((g) => (
            <div key={g.label} className={`rounded-lg border px-3 py-2 ${g.color}`}>
              <p className="text-sm font-semibold">{g.label}</p>
              <p className="text-xs mt-0.5 tabular-nums">{g.range}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        These are defaults and starting points, not empirically validated cut-offs. For each project
        (applies to GitHub and Combined projects), the instructor can adjust the GitHub weights,
        the flag thresholds and the GitHub/Docs blend in Scoring Settings. The Editor formula
        weights are fixed. The report shows the formulas and per-member breakdowns behind every
        number.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  5 — What the report shows per member                                */
/* ------------------------------------------------------------------ */
function MemberBreakdowns() {
  const fileRows = Object.entries(FILE_WEIGHTS).map(([k, v]) => `${k} ${num(v)}`).join(" · ");
  const impactRows = Object.entries(COMMIT_IMPACT).map(([k, v]) => `${k} ${num(v)}×`).join(" · ");
  return (
    <Section
      title="What the report shows for each member"
      intro="Opening a member shows the evidence behind their number, in collapsible sections."
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 h-full">
          <p className="text-sm font-semibold text-slate-800 mb-1">Where the work went</p>
          <p className="text-sm text-slate-700 leading-relaxed mb-2">
            Lines added by file type, and how much each type counts.
          </p>
          <p className="text-xs text-slate-600 tabular-nums">{fileRows}</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 h-full">
          <p className="text-sm font-semibold text-slate-800 mb-1">Commit impact</p>
          <p className="text-sm text-slate-700 leading-relaxed mb-2">
            How meaningful each commit was, regardless of file type.
          </p>
          <p className="text-xs text-slate-600 tabular-nums">{impactRows}</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 h-full">
          <p className="text-sm font-semibold text-slate-800 mb-1">Raw numbers</p>
          <p className="text-sm text-slate-700 leading-relaxed">
            Raw totals beside the weighted ones: lines added, deleted, code versus comment lines,
            commits, active days, self-churn, and Editor activity.
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  6 — Data accuracy rules                                             */
/* ------------------------------------------------------------------ */
function DataAccuracy() {
  const rules = [
    "Merge commits are excluded from line and impact analysis, so merging a teammate's branch does not credit the merger with that work.",
    `Generated files (lock files, build output, minified files, source maps) count ${num(FILE_WEIGHTS.generated)}.`,
    "Every added line counts, whether it is code, a comment or blank. What a line is worth depends on its file type and on the commit it was in, and deleting your own lines lowers it by at most half.",
    "Writing something and later deleting it yourself reduces credit by at most 50%. Deleting a teammate's lines is not penalized.",
    "Formatting changes do not count as authored text: toggling bold or changing a heading changes no characters, so it records no contribution.",
    "Inserted images and imported .docx content are disclosed on the report. Images are never scored; imports are scored with the adjustments described above.",
  ];
  return (
    <Section
      title="Data accuracy rules"
      intro="Rules that keep the numbers from rewarding volume over substance."
    >
      <Bullets items={rules} dot="bg-indigo-500" />
      <p className="text-xs text-slate-600 leading-relaxed mt-3">
        Known limits: pasted or AI-generated text looks like original writing in the edit log, and
        offline work such as meetings, planning or pair programming is not captured. The instructor
        accounts for these; students can add context through a flag for review.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  7 — Roles                                                           */
/* ------------------------------------------------------------------ */
function SystemRoles() {
  const roles = [
    {
      title: "Instructor",
      card: "bg-indigo-50 border-indigo-200",
      dot: "bg-indigo-500",
      items: [
        "Creates class sections and projects, and shares join codes",
        "Writes the project brief: a description, up to 5 images and one PDF",
        "Runs analysis, watches live progress, and reviews the full report with per-member breakdowns",
        "Adjusts the GitHub weights, flag thresholds and GitHub/Docs blend per project in Scoring Settings",
        "Receives notifications about team-health risk, flagged members and disputes",
        "Reviews student disputes and resolves them with a written outcome",
        "Can reassign group leaders. Reports are evidence, not grades. New instructor sign-ups are reviewed by an admin before access is granted",
      ],
    },
    {
      title: "Student",
      card: "bg-slate-50 border-slate-200",
      dot: "bg-slate-500",
      items: [
        "Enrolls with the instructor's join code and reads the project brief",
        "Creates a group (and becomes its leader) or joins an existing group",
        "Sees their own contribution report and flags. Regular members see only their own",
        "A group leader also sees each member's contribution share so work can be distributed fairly. Members are told this on their page",
        "Sees tasks assigned to them, and is notified when a report is ready or a task is assigned",
        "Can flag a finding for review with a free-text note",
      ],
    },
    {
      title: "Admin",
      card: "bg-violet-50 border-violet-200",
      dot: "bg-violet-500",
      items: [
        "Manages user accounts: change roles, activate or deactivate, unlock locked accounts, delete",
        "Assigns system roles (Admin, Instructor, Student)",
        "Approves or rejects new instructor sign-ups",
        "Manages departments",
        "Views the audit log of system events",
        "Is notified of new registrations",
      ],
    },
  ];

  return (
    <Section
      title="The three roles"
      intro="Every role gets in-app notifications (the bell in the sidebar) for the events that concern it."
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
        {roles.map((r) => (
          <div key={r.title} className={`rounded-lg border p-4 flex flex-col gap-2 h-full ${r.card}`}>
            <p className="text-base font-semibold text-slate-900">{r.title}</p>
            <Bullets items={r.items} dot={r.dot} />
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  8 — Fairness and privacy commitments                                */
/* ------------------------------------------------------------------ */
function PrivacySection() {
  const commitments = [
    {
      title: "Decision support, not auto-grading",
      body: "Reports are evidence for the instructor's review. No score, flag or narrative is a grade or final assessment. Instructor judgment is final.",
    },
    {
      title: "Scoped student visibility",
      body: "Students see their own report and flags. Regular members cannot see other members' scores or raw data. The group leader additionally sees each member's contribution share, source split, flags and task counts, and members are told so. Dispute details and instructor notes stay instructor-only.",
    },
    {
      title: "Leadership carries no advantage",
      body: "The leader is the student who created the group, an administrative role only. It grants no contribution credit. The leader is scored on their own recorded activity like everyone else and receives the same flags.",
    },
    {
      title: "Configurable, transparent weights",
      body: "The GitHub weights, flag thresholds and GitHub/Docs blend are documented defaults, not hidden numbers. Instructors can view and adjust them per project in Scoring Settings. The Editor formula weights are fixed.",
    },
    {
      title: "Dispute path",
      body: "Students can flag a finding for review with a note. This gives members a voice for contributions the system cannot see, such as offline collaboration or manual testing.",
    },
    {
      title: "Roles never change scores",
      body: "Functional roles (Developer, Documentation) add context only. The formulas are role-agnostic, so a mis-assigned role can never shield a member from a flag.",
    },
    {
      title: "Planning aids never affect scores",
      body: "When assigning a task, leaders and instructors see each member's open-task count and a \"fewest open tasks\" suggestion. It is a planning hint only and never changes a score or flag.",
    },
  ];

  return (
    <Section title="Fairness and privacy commitments">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
        {commitments.map((item) => (
          <div key={item.title} className="rounded-lg bg-slate-50 border border-slate-200 p-4 h-full">
            <p className="text-sm font-semibold text-slate-900 mb-1">{item.title}</p>
            <p className="text-sm text-slate-700 leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  9 — Where to go next (role-aware)                                   */
/* ------------------------------------------------------------------ */
function WhereToGoNext() {
  const { user, loading } = useAuth();
  const { navigate } = useRouter();

  if (loading) {
    return (
      <Section title="Where to go next">
        <p className="text-sm text-slate-600">Loading…</p>
      </Section>
    );
  }

  let heading = "Sign in to get started";
  let body = "Create an account or sign in to enroll in a class, join a group, or manage projects.";
  let primaryLabel = "Sign in";
  let primaryTarget = "/login";
  let secondary: { label: string; target: string } | null = { label: "Register", target: "/register" };

  if (user?.systemRole === "STUDENT") {
    heading = "Go to your classes";
    body = "View your groups, your own contribution report, and flag any finding for instructor review.";
    primaryLabel = "Go to my classes";
    primaryTarget = "/student";
    secondary = null;
  } else if (user?.systemRole === "INSTRUCTOR") {
    heading = "Go to your dashboard";
    body = "Manage class sections and projects, run analyses, and review fairness reports.";
    primaryLabel = "Go to dashboard";
    primaryTarget = "/dashboard";
    secondary = null;
  } else if (user?.systemRole === "ADMIN") {
    heading = "Go to the admin panel";
    body = "Manage user accounts, system roles, instructor approvals and the audit log.";
    primaryLabel = "Go to admin panel";
    primaryTarget = "/admin";
    secondary = null;
  }

  return (
    <Section title="Where to go next">
      <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-indigo-900 mb-1">{heading}</p>
          <p className="text-sm text-indigo-900 leading-relaxed">{body}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {secondary && (
            <button onClick={() => navigate(secondary!.target)} className={BUTTON_SECONDARY}>
              {secondary.label}
            </button>
          )}
          <button onClick={() => navigate(primaryTarget)} className={BUTTON_PRIMARY}>
            {primaryLabel}
          </button>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Root export                                                         */
/* ------------------------------------------------------------------ */
export function SystemOverview() {
  return (
    <div className="space-y-4">
      <WhatItIs />
      <HowItWorks />
      <DataSources />
      <ScoringSection />
      <MemberBreakdowns />
      <DataAccuracy />
      <SystemRoles />
      <PrivacySection />
      <WhereToGoNext />
    </div>
  );
}
