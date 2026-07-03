import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/*  Badges & shared helpers                                             */
/* ------------------------------------------------------------------ */
function Built() {
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700">
      ✓ Implemented
    </span>
  );
}
function Planned() {
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700">
      Planned — next build
    </span>
  );
}
function SectionHeader({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-semibold text-slate-700 mb-4">{children}</h2>;
}

/* ------------------------------------------------------------------ */
/*  Section 1 — What it is & core principle                            */
/* ------------------------------------------------------------------ */
function WhatItIs() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <SectionHeader>What FAIR TRAZE AI Is</SectionHeader>
      <p className="text-xs text-slate-600 leading-relaxed mb-4">
        FAIR TRAZE AI helps instructors fairly assess individual contributions inside academic group
        projects. It collects digital collaboration traces, scores each member's contribution
        deterministically, detects participation imbalances, and produces an explainable
        evidence-based fairness report — so instructors can review individual work with confidence.
      </p>

      {/* Core principle callout */}
      <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-5 py-4 flex items-start gap-3">
        <span className="text-indigo-400 text-lg leading-none mt-0.5">⚖</span>
        <div>
          <p className="text-xs font-semibold text-indigo-900 mb-1">Core principle: the math scores; the AI explains.</p>
          <p className="text-xs text-indigo-700 leading-relaxed">
            All contribution scores, participation flags, the Gini coefficient, and the team-health
            label are computed deterministically in code. Google Gemini only writes the
            plain-language narrative — it never computes, changes, or overrides the numbers, and it
            never assigns grades. This separation is absolute and intentional.
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
/*  Section 2 — Data sources                                           */
/* ------------------------------------------------------------------ */
function DataSources() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <SectionHeader>Two Data Sources — the System's Defining Approach</SectionHeader>
      <p className="text-xs text-slate-500 leading-relaxed mb-5">
        GitHub captures code. The FairTraze Collaborative Editor captures writing and documentation.
        Together they give instructors visibility into both technical and documentary contributions —
        especially important for teams where some members are primarily documentation contributors
        who appear invisible in GitHub data alone. Each source produces an independent contribution
        share; the two are then blended into a combined score.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* GitHub — implemented */}
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-indigo-900">GitHub Repository</span>
            <Built />
          </div>
          <p className="text-xs text-indigo-700 leading-relaxed">
            Per-member commit history fetched via the GitHub REST API (Octokit). Tracks commits,
            additions, deletions, active days, and file-type context. Significance weighting
            adjusts for file type and commit impact. Self-churn penalty discounts writing then
            deleting one's own lines. Produces a deterministic GitHub contribution share per member.
          </p>
        </div>

        {/* FairTraze Docs — planned */}
        <div className="rounded-lg bg-slate-50 border border-dashed border-amber-300 p-4 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-slate-600">FairTraze Collaborative Editor</span>
            <Planned />
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            A built-in writing environment (TipTap + Yjs) that records per-user, timestamped
            collaboration traces — text inserted/deleted, comments, and suggestions. Mirrors the
            GitHub model: net retained text (lines-equivalent), active editing days,
            edit-timing distribution, and self-churn ratio. Produces an independent editor
            contribution share.
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
/*  Section 3 — System roles                                           */
/* ------------------------------------------------------------------ */
function SystemRoles() {
  const roles = [
    {
      title: "Instructor",
      color: "indigo",
      items: [
        "Creates class sections and assignments; generates join codes",
        "Manages the class roster and can reassign group leaders",
        "Runs GitHub analysis and views the full fairness report for any group",
        "Receives at-risk alerts when member activity is low",
        "Reviews student disputes and resolves or dismisses them with a written outcome",
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
        "Can flag a flag for review with a free-text note (dispute path to the instructor)",
      ],
    },
    {
      title: "Admin",
      color: "violet",
      items: [
        "Manages all user accounts: create, edit, promote, deactivate",
        "Assigns system roles (ADMIN, INSTRUCTOR, STUDENT)",
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
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <SectionHeader>System Roles</SectionHeader>
        <Built />
      </div>
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
/*  Section 4 — Lifecycle (Model B)                                    */
/* ------------------------------------------------------------------ */
function Lifecycle() {
  const steps = [
    {
      actor: "Instructor",
      color: "indigo",
      action: "Creates a class section and one or more assignments (projects) inside it. Each class has one join code that students use to enroll.",
    },
    {
      actor: "Students",
      color: "slate",
      action: "Enroll in the class using the join code. Each enrolled student can then create or join a group per assignment.",
    },
    {
      actor: "Group Leader",
      color: "slate",
      action: "The first student to create a group becomes the leader. The leader names the group, connects the GitHub repository (for GitHub/Combined assignments), and assigns functional roles to members.",
    },
    {
      actor: "Members",
      color: "slate",
      action: "Join the group. Each member's GitHub username is drawn from their account profile — they self-register their own identity (most accurate, hardest to mis-attribute).",
    },
    {
      actor: "Instructor",
      color: "indigo",
      action: "Reviews and locks the roster, then runs the analysis. The fairness report is saved and visible to both instructor and the group's members.",
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <SectionHeader>Project Lifecycle</SectionHeader>
        <Built />
      </div>
      <p className="text-xs text-slate-400 mb-5">
        Setup is distributed so an instructor with many groups is not a data-entry bottleneck.
      </p>

      <div className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
              <div className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${s.color === "indigo" ? "bg-indigo-500" : "bg-slate-400"}`}>
                {i + 1}
              </div>
              {i < steps.length - 1 && <div className="w-px flex-1 bg-slate-200 min-h-[16px]" />}
            </div>
            <div className="pb-3">
              <span className={`text-xs font-semibold ${s.color === "indigo" ? "text-indigo-700" : "text-slate-600"}`}>
                {s.actor}
              </span>
              <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{s.action}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 pt-4 mt-2">
        <p className="text-xs font-semibold text-slate-600 mb-2">Leader role is administrative only</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          The group leader is whoever first creates the group — a structural designation only. Being
          the leader grants <span className="font-medium text-slate-700">zero contribution credit</span> and has no effect on any score. The leader is
          scored on their actual recorded traces exactly like every other member. If their
          contribution share falls below the free-rider threshold, they receive the flag like any
          other member. Leadership is invisible to the scoring engine.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 5 — GitHub Analysis & Scoring                              */
/* ------------------------------------------------------------------ */
function ScoringSection() {
  const pipeline = [
    { label: "Data collection", desc: "Fetch per-member commit history, additions, deletions, and file diffs from the GitHub REST API via Octokit. Handles pagination and rate limits." },
    { label: "Line classification", desc: "Each added line is classified as code, comment, or blank using language-aware comment markers. Meaningful lines = codeLinesAdded + 0.25 × commentLinesAdded. Blank lines contribute zero." },
    { label: "Significance weighting", desc: "File-type weights (source 1.0, test 0.8, style 0.7, docs 0.6, config 0.3, generated 0.0) and commit-impact multipliers (structural 1.5, functional 1.0, cosmetic 0.5, trivial 0.2) adjust raw additions to reflect the weight of the work." },
    { label: "Self-churn penalty", desc: "Lines a member added and later deleted themselves incur a penalty up to 50%. effectiveAdditions = weightedAdditions × (1 − 0.5 × selfChurnRatio). The penalty never zeroes out contribution." },
    { label: "Contribution share", desc: "commitShare uses log-scale counts (Math.log(commits + 1)) to limit commit-padding. contributionShare = 0.4 × commitShare + 0.4 × linesShare + 0.2 × activeDaysShare. All weights and flag thresholds are instructor-configurable." },
  ];

  const flags = [
    { name: "Inactive", desc: "No recorded commits in the analysis window." },
    { name: "Free-rider", desc: "contributionShare < 0.5 × equalShare (configurable)." },
    { name: "Overload", desc: "contributionShare > 1.75 × equalShare — one member carrying the team." },
    { name: "Deadline-driven", desc: "> 60% of commits concentrated in the final third of the project timeline." },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <SectionHeader>GitHub Analysis &amp; Scoring</SectionHeader>
        <Built />
      </div>

      {/* Pipeline */}
      <div className="space-y-2 mb-6">
        {pipeline.map((p, i) => (
          <div key={i} className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3 flex items-start gap-3">
            <span className="h-5 w-5 shrink-0 mt-0.5 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
            <div>
              <p className="text-xs font-semibold text-indigo-900">{p.label}</p>
              <p className="text-xs text-indigo-700 leading-relaxed mt-0.5">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Formula */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 mb-5">
        <p className="text-xs font-semibold text-slate-600 mb-1">Contribution formula</p>
        <p className="text-xs font-mono text-slate-700">
          contributionShare = 0.4 × commitShare + 0.4 × linesShare + 0.2 × activeDaysShare
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Weights and flag thresholds are documented defaults — instructor-configurable per assignment.
        </p>
      </div>

      {/* Flags */}
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

      {/* Gini */}
      <div>
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 6 — Group roles                                            */
/* ------------------------------------------------------------------ */
function GroupRoles() {
  const roles = [
    {
      name: "Leader",
      kind: "Administrative flag",
      source: "—",
      note: "Whoever created the group. Assigns functional roles to any member (including themselves) directly — applied immediately, no approval. Administrative only — no scoring credit.",
      color: "slate",
      status: "built",
    },
    {
      name: "Developer",
      kind: "Functional role",
      source: "GitHub",
      note: "Expected to have GitHub commit activity. The system surfaces a soft note to the instructor if a Developer has no commit activity in the analysis window.",
      color: "indigo",
      status: "built",
    },
    {
      name: "Documentation",
      kind: "Functional role",
      source: "FairTraze Editor",
      note: "Expected to have editor activity. Source-presence check activates once the Collaborative Editor is built (planned).",
      color: "amber",
      status: "partial",
    },
  ];

  const colorMap: Record<string, { card: string; title: string }> = {
    slate:  { card: "bg-slate-50 border-slate-200",                    title: "text-slate-800"  },
    indigo: { card: "bg-indigo-50 border-indigo-200",                  title: "text-indigo-900" },
    amber:  { card: "bg-amber-50 border-dashed border-amber-300",      title: "text-amber-900"  },
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <SectionHeader>Group Roles</SectionHeader>
        <Built />
      </div>
      <p className="text-xs text-slate-400 mb-5">
        Roles add context and drive source-presence notes. They never change scores. A member with
        a low contribution share is flagged regardless of their assigned role.
      </p>

      {/* Role cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {roles.map((r) => {
          const c = colorMap[r.color]!;
          return (
            <div key={r.name} className={`rounded-lg border p-4 ${c.card}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className={`text-sm font-semibold ${c.title}`}>{r.name}</span>
                {r.status === "partial" ? <Planned /> : <Built />}
              </div>
              <p className="text-xs text-slate-500 mb-1">
                <span className="font-medium text-slate-600">Kind:</span> {r.kind}
              </p>
              <p className="text-xs text-slate-500 mb-2">
                <span className="font-medium text-slate-600">Expected source:</span> {r.source}
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">{r.note}</p>
            </div>
          );
        })}
      </div>

      {/* Assignment model */}
      <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-4 mb-4">
        <p className="text-xs font-semibold text-indigo-900 mb-2">How roles are assigned</p>
        <ul className="space-y-2">
          {[
            { actor: "Leader", desc: "Assigns roles to any member (including themselves) directly in Manage Group — applied immediately, no approval step." },
            { actor: "Member", desc: "Suggests a role for themselves from their project view. Creates a pending request the leader must Accept or Decline. The role does NOT apply until accepted." },
            { actor: "Instructor", desc: "Overrides any member's role directly at any time, bypassing the suggestion flow." },
          ].map((item) => (
            <li key={item.actor} className="flex items-start gap-2">
              <span className="shrink-0 text-[10px] font-bold text-indigo-700 bg-indigo-100 border border-indigo-200 rounded px-1.5 py-0.5 mt-0.5">{item.actor}</span>
              <p className="text-xs text-indigo-700 leading-relaxed">{item.desc}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
        <p className="text-xs font-semibold text-slate-600 mb-1">Roles never change scores</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          The scoring formula is role-agnostic. Two members with identical traces receive identical
          scores regardless of their assigned roles. This preserves objectivity, defensibility, and
          resistance to role mis-assignment being used to shield a member from a flag.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 7 — Explainable AI narrative                               */
/* ------------------------------------------------------------------ */
function AISection() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <SectionHeader>Explainable AI Narrative</SectionHeader>
        <Built />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
          <p className="text-xs font-semibold text-emerald-800 mb-2">What the AI does</p>
          <ul className="space-y-1.5">
            {[
              "Receives the fully-computed TeamReport JSON (scores, flags, Gini, health label)",
              "Writes a plain-language fairness narrative explaining what the numbers mean",
              "Cites specific evidence from the computed data",
              "Uses professional, non-accusatory language per the system's tone guidelines",
            ].map((item) => (
              <li key={item} className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5">✓</span>
                <span className="text-xs text-emerald-700 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-xs font-semibold text-red-800 mb-2">What the AI strictly does not do</p>
          <ul className="space-y-1.5">
            {[
              "Compute, change, or override any score, flag, or Gini value",
              "Assign grades or recommend a grade",
              "Make accusations — all findings cite computed evidence, not intent",
              "Substitute for instructor judgment",
            ].map((item) => (
              <li key={item} className="flex items-start gap-1.5">
                <span className="text-red-400 mt-0.5">✕</span>
                <span className="text-xs text-red-700 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-3">
        Model: Google Gemini. All numbers in the narrative are authoritative from the scoring engine — the AI only narrates them.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 8 — Fairness tools                                         */
/* ------------------------------------------------------------------ */
function FairnessTools() {
  const tools = [
    {
      name: "Explainable fairness report",
      status: "built",
      desc: "Health badge (Healthy / Moderate Risk / High Risk), scored member table with contribution shares and flags, bar chart, and the AI narrative. Saved to the database and viewable any time.",
    },
    {
      name: "Export &amp; print",
      status: "built",
      desc: "Instructors can export the full report as a PDF for offline review, archiving, or uploading to an LMS grade book.",
    },
    {
      name: "At-risk alerts",
      status: "built",
      desc: "Proactive notifications when a member's recorded activity drops below configurable thresholds during an active project — so instructors can intervene before the deadline.",
    },
    {
      name: "Student dispute workflow",
      status: "built",
      desc: "Students can flag any participation flag with a free-text note explaining context the system cannot capture (offline meetings, pair programming, manual testing). The instructor is notified, reviews the note, and resolves or dismisses the dispute with a written outcome recorded on the flag.",
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <SectionHeader>Fairness Tools</SectionHeader>
        <Built />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tools.map((t) => (
          <div key={t.name} className="rounded-lg bg-indigo-50 border border-indigo-200 p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <span
                className="text-xs font-semibold text-indigo-900"
                dangerouslySetInnerHTML={{ __html: t.name }}
              />
              <Built />
            </div>
            <p className="text-xs text-indigo-700 leading-relaxed">{t.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 9 — Privacy, oversight & student agency                    */
/* ------------------------------------------------------------------ */
function PrivacySection() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <SectionHeader>Privacy, Oversight &amp; Student Agency</SectionHeader>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            title: "Decision-support, not auto-grading",
            body: "Reports are evidence for the instructor's review. No score, flag, or narrative constitutes a grade or final assessment. Instructor judgment is final.",
          },
          {
            title: "Scoped student visibility",
            body: "Students see their own contribution report and flags. They cannot see other members' individual scores or raw data. The full team view is instructor-only.",
          },
          {
            title: "Dispute path",
            body: "Students have one action: flag a finding for review with a note. This gives members a voice for contributions the system cannot see — offline collaboration, verbal discussions, manual testing.",
          },
        ].map((item) => (
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
/*  Section 10 — What's next                                           */
/* ------------------------------------------------------------------ */
function WhatsNext() {
  return (
    <div className="bg-white border border-dashed border-amber-300 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <SectionHeader>What's Next — Planned Build</SectionHeader>
        <Planned />
      </div>
      <p className="text-xs text-slate-400 mb-5">
        The current system analyses GitHub repositories. The next build adds the second data source and combined scoring.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
          <p className="text-xs font-semibold text-amber-800 mb-2">FairTraze Collaborative Editor</p>
          <p className="text-xs text-amber-700 leading-relaxed mb-3">
            A writing environment built directly into FAIR TRAZE AI. Records per-user, timestamped
            collaboration traces: characters inserted/deleted, edit sessions, comments, and
            suggestions. Activity tied to the logged-in account — stronger identity than
            self-registered GitHub usernames.
          </p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Scoring mirrors the GitHub model: net retained text (primary), active editing days,
            edit-timing distribution (deadline-driven detection), and self-churn ratio. Edit types
            are weighted by substance (substantive prose, revision, formatting-only, trivial).
          </p>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
          <p className="text-xs font-semibold text-amber-800 mb-2">Combined GitHub + Editor Scoring</p>
          <p className="text-xs text-amber-700 leading-relaxed mb-3">
            Each source produces its own normalised contribution share. The two are blended
            into a combined score:
          </p>
          <p className="text-xs font-mono text-amber-900 bg-amber-100 rounded px-3 py-2 mb-3">
            combinedShare = w<sub>GitHub</sub> × githubShare + w<sub>Editor</sub> × editorShare
          </p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Default 50 / 50. Instructor-configurable per assignment. The math stays
            deterministic; the AI only explains. Role-aware source-presence mismatch detection
            (e.g. assigned Developer but no GitHub commits) surfaces as a note — it never
            automatically re-weights scores.
          </p>
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
      <SystemRoles />
      <Lifecycle />
      <ScoringSection />
      <GroupRoles />
      <AISection />
      <FairnessTools />
      <PrivacySection />
      <WhatsNext />

      {/* Scope legend */}
      <div className="flex items-center gap-6 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 flex-wrap">
        <span className="font-medium text-slate-600">Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
          Implemented — live in this build
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
          Planned — next build (FairTraze Collaborative Editor + combined scoring)
        </span>
      </div>
    </div>
  );
}
