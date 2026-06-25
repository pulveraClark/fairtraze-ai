import React, { useState } from "react";
import type { ReactNode } from "react";
import type { ScoredMember, Flag, MemberRoleInfo } from "@shared/types";
import { InfoTooltip, TipList } from "./InfoTooltip";
import { useRouter } from "../router";

const flagStyles: Record<Flag, string> = {
  inactive:          "bg-red-100 text-red-700",
  "free-rider":      "bg-red-100 text-red-700",
  overload:          "bg-orange-100 text-orange-700",
  "deadline-driven": "bg-yellow-100 text-yellow-700",
};

const rolePill: Record<string, string> = {
  DEVELOPER:     "bg-indigo-50 border-indigo-200 text-indigo-700",
  DOCUMENTATION: "bg-teal-50 border-teal-200 text-teal-700",
};
const roleLabel: Record<string, string> = {
  DEVELOPER: "Developer", DOCUMENTATION: "Documentation",
};

// Map from studentName → flag → "RESOLVED" | "DISMISSED"
// Built from resolved/dismissed disputes so the instructor sees review outcomes on flags.
type ResolvedFlagOutcomes = Map<string, Map<string, "RESOLVED" | "DISMISSED">>;

interface Props {
  members: ScoredMember[];
  // Set of studentNames that have at least one OPEN dispute (from the instructor's view)
  disputedMembers?: Set<string>;
  // Pre-computed review outcomes per member per flag (RESOLVED → Accepted, DISMISSED → Upheld)
  resolvedFlagOutcomes?: ResolvedFlagOutcomes;
  // Functional roles + soft mismatch notes per member — context only, never affects scores
  memberRoles?: MemberRoleInfo[];
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function DetailSection({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-semibold text-slate-400 uppercase tracking-wide mb-1.5 text-[10px] flex items-center">
        {label}
        {tooltip && <InfoTooltip label={`About ${label}`} content={tooltip} />}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <p className="text-xs text-slate-600">
      {label}:{" "}
      <span className="font-medium text-slate-800">{value}</span>
    </p>
  );
}

export function MemberTable({ members, disputedMembers, resolvedFlagOutcomes, memberRoles }: Props) {
  const { navigate } = useRouter();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggleRow(username: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide border-t border-slate-100">
            <th className="text-left px-6 py-3 font-medium">Member</th>
            <th className="text-left px-4 py-3 font-medium">
              Contribution Share
              <InfoTooltip
                label="What is Contribution Share?"
                content={
                  <TipList items={[
                    ["Member's share", "of the team's total contribution"],
                    ["Fair share", "= 100% ÷ number of members"],
                  ]} />
                }
              />
            </th>
            <th className="text-left px-4 py-3 font-medium">
              Flags
              <InfoTooltip
                label="What are Flags?"
                content={
                  <TipList items={[
                    ["Inactive", "no commits"],
                    ["Free-rider", "below fair share"],
                    ["Overload", "well above fair share"],
                    ["Deadline-driven", "work crammed near the deadline"],
                  ]} />
                }
              />
            </th>
            <th className="w-10 px-4 py-3" aria-label="Expand" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {members.map((m) => {
            const expanded = expandedRows.has(m.githubUsername);
            return (
              <React.Fragment key={m.githubUsername}>
                {/* Primary row */}
                <tr
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => toggleRow(m.githubUsername)}
                >
                  <td className="px-6 py-3">
                    <div className="font-medium text-slate-800">{m.studentName}</div>
                    {(() => {
                      const info = memberRoles?.find((r) => r.githubUsername.toLowerCase() === m.githubUsername.toLowerCase());
                      if (!info || info.functionalRoles.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {info.isLeader && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-indigo-50 border-indigo-200 text-indigo-700">
                              Leader
                            </span>
                          )}
                          {info.functionalRoles.map((role) => (
                            <span key={role} className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${rolePill[role] ?? "bg-slate-50 border-slate-200 text-slate-600"}`}>
                              {roleLabel[role] ?? role}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <span className="tabular-nums font-semibold text-slate-700 w-12 text-right shrink-0">
                        {(m.contributionShare * 100).toFixed(1)}%
                      </span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-400"
                          style={{ width: `${Math.min(m.contributionShare * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {m.flags.length === 0 && !disputedMembers?.has(m.studentName) ? (
                        <span className="text-slate-400 text-xs italic">No flags</span>
                      ) : (
                        <>
                          {m.flags.map((flag) => {
                            const outcome = resolvedFlagOutcomes?.get(m.studentName)?.get(flag);
                            return (
                              <span key={flag} className="inline-flex items-center gap-1 flex-wrap">
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${flagStyles[flag]}`}>
                                  {flag}
                                </span>
                                {outcome === "RESOLVED" && (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Reviewed — Accepted
                                  </span>
                                )}
                                {outcome === "DISMISSED" && (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">
                                    Reviewed — Upheld
                                  </span>
                                )}
                              </span>
                            );
                          })}
                          {disputedMembers?.has(m.studentName) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate("/disputes"); }}
                              className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                              title="This member has an open dispute — click to view in Disputes inbox"
                            >
                              Disputed
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {/* Mismatch note — soft context only, distinct from contribution flags */}
                    {(() => {
                      const note = memberRoles?.find((r) => r.githubUsername.toLowerCase() === m.githubUsername.toLowerCase())?.mismatchNote;
                      if (!note) return null;
                      return (
                        <p className="mt-1.5 text-[10px] text-sky-600 font-medium flex items-start gap-1">
                          <span className="shrink-0">Context:</span>
                          <span className="font-normal text-sky-500">{note}</span>
                        </p>
                      );
                    })()}
                  </td>

                  <td className="px-4 py-3 text-slate-400">
                    <ChevronIcon expanded={expanded} />
                  </td>
                </tr>

                {/* Expandable detail row */}
                {expanded && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={4} className="px-6 py-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-4">
                        <DetailSection
                          label="Activity"
                          tooltip={
                            <TipList items={[
                              ["Commits", "commits made"],
                              ["Churn", "lines added + deleted"],
                              ["Active Days", "distinct days committed"],
                            ]} />
                          }
                        >
                          <Stat label="Commits" value={m.commits} />
                          <Stat label="Churn" value={m.churn.toLocaleString()} />
                          <Stat label="Active Days" value={m.activeDays} />
                        </DetailSection>

                        <DetailSection
                          label="Significance"
                          tooltip={
                            <TipList items={[
                              ["Weighted Lines", "lines counted by importance"],
                              ["Self-Churn", "% of own lines later deleted"],
                              ["Code Lines", "actual code added"],
                              ["Comment Lines", "comments added (counted lightly)"],
                            ]} />
                          }
                        >
                          <Stat
                            label="Weighted Lines"
                            value={m.weightedAdditions.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          />
                          <Stat
                            label="Self-Churn"
                            value={`${(m.selfChurnRatio * 100).toFixed(1)}%`}
                          />
                          <Stat label="Code Lines Added" value={m.codeLinesAdded.toLocaleString()} />
                          <Stat label="Comment Lines Added" value={m.commentLinesAdded.toLocaleString()} />
                        </DetailSection>

                        <DetailSection
                          label="Commit Impact"
                          tooltip={
                            <TipList items={[
                              ["Structural", "new files / many files touched"],
                              ["Functional", "work on existing code"],
                              ["Cosmetic", "formatting / non-code edits"],
                              ["Trivial", "tiny edits, e.g. a typo"],
                            ]} />
                          }
                        >
                          <Stat label="Structural" value={m.commitImpactBreakdown.structural} />
                          <Stat label="Functional"  value={m.commitImpactBreakdown.functional} />
                          <Stat label="Cosmetic"    value={m.commitImpactBreakdown.cosmetic} />
                          <Stat label="Trivial"     value={m.commitImpactBreakdown.trivial} />
                        </DetailSection>

                        <DetailSection
                          label="File Types"
                          tooltip={
                            <TipList items={[
                              ["src", "source code (counts fully)"],
                              ["test", "test files"],
                              ["style", "CSS/SCSS"],
                              ["docs", "documentation"],
                              ["config", "settings (counts little)"],
                              ["other", "uncategorized (generated files excluded)"],
                            ]} />
                          }
                        >
                          <Stat label="src"    value={m.fileTypeBreakdown.source} />
                          <Stat label="test"   value={m.fileTypeBreakdown.test} />
                          <Stat label="style"  value={m.fileTypeBreakdown.style} />
                          <Stat label="docs"   value={m.fileTypeBreakdown.docs} />
                          <Stat label="config" value={m.fileTypeBreakdown.config} />
                          <Stat label="other"  value={m.fileTypeBreakdown.other} />
                        </DetailSection>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
