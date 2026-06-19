# FAIR TRAZE AI — Project Context

This file gives you (Claude Code) the context for this capstone project. Read it before making changes.

## What this system is
FAIR TRAZE AI helps instructors fairly assess individual contributions in academic group projects. It collects digital collaboration traces, scores each member's contribution, detects participation imbalance (free-riding, overload, deadline-driven work), and produces an explainable, evidence-based fairness report. It **supports** instructor judgment — it never replaces it and never assigns grades.

## Core principle (do not violate)
**The math scores; the AI explains.** All contribution scores, flags, the Gini coefficient, and the team-health label are computed deterministically in code (`shared/src/scoring.ts`). The AI (Gemini) only writes a plain-language explanation of those already-computed numbers. The AI must never compute, change, or override the numbers, and must never assign grades. Keep this separation intact.

## What is actually built (one core transaction — do not expand beyond this)
**"Generate an Explainable Contribution Fairness Report from a GitHub repository."**
Flow: pick a project → fetch each member's GitHub activity via Octokit → compute scores, flags, and team health → Gemini writes the fairness narrative → save and display it.

### Out of scope — DO NOT build these (they are designed but future modules)
- The FAIR TRAZE Collaborative Editor and any document/Google Docs integration
- Login, accounts, and roles (admin / instructor / group leader / student)
- Project join codes, team creation, role assignment, and member self-registration
- Predictive alerts and institutional/admin analytics

## Designed setup-responsibilities workflow (proposed flow — NOT built; show it in the System Overview only)
Setup is distributed so an instructor with many sections and many groups per section is not a data-entry bottleneck:
- **Instructor**: creates the assignment/project and shares a join code; oversees results and can confirm/lock the roster and repo before grading. Retains final authority.
- **Group Leader**: creates the group and connects the GitHub repository.
- **Each Member**: joins via the code and self-registers their own GitHub username.
- **Integrity safeguards** (important for a fairness system): members confirm their own usernames (most accurate, hardest to manipulate); the instructor oversees and locks; and the system surfaces unmatched GitHub contributors, so a missing or mis-mapped member is automatically visible.
This prototype does NOT implement roles, join codes, or self-registration. It uses a seeded roster. The workflow above is the proposed design to be communicated in the System Overview, not built.

## Stack
- **client**: React + Vite + TypeScript + Tailwind + Recharts — an instructor-facing dashboard
- **server**: Express + TypeScript + Prisma (SQLite) + Octokit (GitHub) + Gemini API
- **shared**: shared TypeScript types and the deterministic scoring module

## Data model (Prisma)
- `Project { id, name, repoUrl, createdAt }`
- `Member { id, projectId, studentName, githubUsername }`
- `Report { id, projectId, generatedAt, gini, teamHealth, content }`

## Key computed types (`shared/src/types.ts`)
- `ScoredMember`: commits, additions, deletions, churn, activeDays, lastPhaseRatio, commitShare, churnShare, activeDaysShare, contributionShare, flags
- `Flag` = "inactive" | "free-rider" | "overload" | "deadline-driven"
- `TeamReport`: members, memberCount, gini, teamHealth ("Healthy" | "Moderate Risk" | "High Risk")

## Audience and tone
The user is an **instructor**. Both the UI and the AI report must be professional, factual, fair, and **non-accusatory** — describe patterns and cite evidence, never moralize or accuse. Privacy is a stated system value; demo data should use anonymized member names (e.g. "Member A").

## Terminology (from the capstone paper)
- **Contribution Profiling**: building participation profiles from activity records.
- **Participation Imbalance Detection**: identifying free-riding, workload concentration, minimal involvement, and deadline-driven activity.
- **Explainable AI**: outputs that provide transparent explanations and supporting evidence for the system's analysis.

## Rules for changes
- Do not change the scoring or imbalance logic in `shared/` — it is deliberately deterministic and must stay defensible.
- Do not build any out-of-scope module listed above; for the designed workflow, present it as UI/overview content only.
- Keep the frontend clean, professional, and instructor-facing.
- Never present system outputs as final grades; they are evidence to support the instructor's decision.
