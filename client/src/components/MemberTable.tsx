import React, { useState } from "react";
import type { ReactNode } from "react";
import type { ScoredMember, DocumentScoredMember, CombinedScoredMember, AnyScoredMember, MemberRoleInfo } from "@shared/types";
import { InfoTooltip, TipList, WeightList } from "./InfoTooltip";
import { FlagTag } from "./FlagTag";
import { useRouter } from "../router";

const rolePill: Record<string, string> = {
  DEVELOPER:     "bg-indigo-50 border-indigo-200 text-indigo-700",
  DOCUMENTATION: "bg-teal-50 border-teal-200 text-teal-700",
};
const roleLabel: Record<string, string> = {
  DEVELOPER: "Developer", DOCUMENTATION: "Documentation",
};

// Boilerplate explanation for the .docx-import disclosure tooltip — identical regardless of the
// member or character count, so it's a static constant rather than parsed out of
// DocumentScoredMember.importNote (shared/src/documentScoring.ts's full sentence, which stays
// untouched as the source of truth for any other consumer).
const IMPORT_NOTE_TOOLTIP =
  "Session credit includes an estimate based on import volume; active-day count reflects only the day of upload, not offline drafting time.";

// Map from studentName → flag → "RESOLVED" | "DISMISSED"
// Built from resolved/dismissed disputes so the instructor sees review outcomes on flags.
type ResolvedFlagOutcomes = Map<string, Map<string, "RESOLVED" | "DISMISSED">>;

interface Props {
  members: AnyScoredMember[];
  // "document" renders FairTraze Docs stats (sessions/retained text) instead of GitHub stats;
  // "combined" renders GitHub share + Docs share + blend weights for COMBINED projects.
  variant?: "github" | "document" | "combined";
  // Set of studentNames that have at least one OPEN dispute (from the instructor's view)
  disputedMembers?: Set<string>;
  // Pre-computed review outcomes per member per flag (RESOLVED → Accepted, DISMISSED → Upheld)
  resolvedFlagOutcomes?: ResolvedFlagOutcomes;
  // Functional roles + soft mismatch notes per member — context only, never affects scores.
  // GitHub-only concept (DEVELOPER/DOCUMENTATION mismatch); not used in the "document" variant.
  memberRoles?: MemberRoleInfo[];
  // Discloses which basis produced the deadline-driven flag's window for this report —
  // surfaced in the Flags legend tooltip, next to the "Deadline-driven" definition.
  deadlineWindowBasis?: "assignment-deadline" | "activity-span";
}

function isDocumentMember(m: ScoredMember | DocumentScoredMember | CombinedScoredMember): m is DocumentScoredMember {
  return "sessionCount" in m;
}

function isCombinedMember(m: ScoredMember | DocumentScoredMember | CombinedScoredMember): m is CombinedScoredMember {
  return "githubContributionShare" in m;
}

function isGithubMember(m: ScoredMember | DocumentScoredMember | CombinedScoredMember): m is ScoredMember {
  return "commits" in m;
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
  wide,
  children,
}: {
  label: string;
  tooltip?: ReactNode;
  // WeightList tooltips size to their own content so aligned columns never wrap
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-semibold text-slate-400 uppercase tracking-wide mb-1.5 text-[10px] flex items-center">
        {label}
        {tooltip && <InfoTooltip label={`About ${label}`} content={tooltip} width={wide ? "max-content" : undefined} />}
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

export function MemberTable({ members, variant = "github", disputedMembers, resolvedFlagOutcomes, memberRoles, deadlineWindowBasis }: Props) {
  const { navigate } = useRouter();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggleRow(studentName: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(studentName)) next.delete(studentName);
      else next.add(studentName);
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
                  <>
                    <TipList items={[
                      ["Inactive", "no commits"],
                      ["Free-rider", "below fair share"],
                      ["Overload", "well above fair share"],
                      ["Deadline-driven", "work crammed near the deadline"],
                    ]} />
                    {deadlineWindowBasis && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #334155", color: "#94a3b8", fontSize: 11 }}>
                        Deadline-driven basis: {deadlineWindowBasis === "assignment-deadline"
                          ? "the assignment deadline."
                          : "observed activity span (no deadline set)."}
                      </div>
                    )}
                  </>
                }
              />
            </th>
            <th className="w-10 px-4 py-3" aria-label="Expand" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {members.map((m, i) => {
            const expanded = expandedRows.has(m.studentName);
            const stripe   = i % 2 === 0 ? "bg-white" : "bg-gray-50";
            return (
              <React.Fragment key={m.studentName}>
                {/* Primary row */}
                <tr
                  className={`${stripe} hover:bg-slate-100 transition-colors cursor-pointer`}
                  onClick={() => toggleRow(m.studentName)}
                >
                  <td className="px-6 py-3">
                    <div className="font-medium text-slate-800">{m.studentName}</div>
                    {(() => {
                      if (variant === "document") return null;
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
                                <FlagTag flag={flag} />
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
                      if (variant === "document") return null;
                      const note = memberRoles?.find((r) => r.githubUsername.toLowerCase() === m.githubUsername.toLowerCase())?.mismatchNote;
                      if (!note) return null;
                      return (
                        <p className="mt-1.5 text-[10px] text-sky-600 font-medium flex items-start gap-1">
                          <span className="shrink-0">Context:</span>
                          <span className="font-normal text-sky-500">{note}</span>
                        </p>
                      );
                    })()}
                    {/* .docx-import disclosure — always visible (not gated behind expand), since
                        this is a disclosed scoring estimate, not incidental detail. Distinct
                        amber styling from the sky-toned mismatchNote above: that one flags
                        something to investigate, this one discloses how a score was computed.
                        Visible text is built from importedRetainedChars directly (not parsed out
                        of importNote) — see IMPORT_NOTE_TOOLTIP's comment. importNote's presence
                        is still the trigger condition, since it's the single source of truth for
                        "did this member import anything". */}
                    {(() => {
                      const importedChars =
                        variant === "document" && isDocumentMember(m)
                          ? (m.importNote ? m.importedRetainedChars : null)
                          : variant === "combined" && isCombinedMember(m)
                          ? (m.document?.importNote ? m.document.importedRetainedChars : null)
                          : null;
                      if (importedChars === null) return null;
                      return (
                        <p className="mt-1.5 text-[10px] text-amber-700 font-medium flex items-center gap-1">
                          <span className="shrink-0">Import:</span>
                          <span className="font-normal text-amber-600">
                            {importedChars.toLocaleString()} characters imported from .docx
                          </span>
                          <InfoTooltip label="About this import" content={IMPORT_NOTE_TOOLTIP} width={220} />
                        </p>
                      );
                    })()}
                  </td>

                  <td className="px-4 py-3 text-slate-400">
                    <ChevronIcon expanded={expanded} />
                  </td>
                </tr>

                {/* Expandable detail row */}
                {expanded && variant === "combined" && isCombinedMember(m) && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={4} className="px-6 py-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
                        <DetailSection
                          label="GitHub Share"
                          wide
                          tooltip={
                            <WeightList
                              header="GitHub-side contribution"
                              items={[
                                ["Share", "this member's share within the GitHub-only pipeline"],
                                ["Commits", "raw commit count on this source"],
                              ]}
                            />
                          }
                        >
                          <Stat label="Share" value={`${(m.githubContributionShare * 100).toFixed(1)}%`} />
                          <Stat label="Commits" value={m.github?.commits ?? 0} />
                          <Stat label="Active Days" value={m.github?.activeDays ?? 0} />
                        </DetailSection>

                        <DetailSection
                          label="Docs Share"
                          wide
                          tooltip={
                            <WeightList
                              header="FairTraze Docs-side contribution"
                              items={[
                                ["Share", "this member's share within the Docs-only pipeline"],
                                ["Sessions", "distinct editing sessions on this source"],
                                ["Imported Characters", "of the retained characters, how many came from a .docx import — see the Import disclosure note"],
                              ]}
                            />
                          }
                        >
                          <Stat label="Share" value={`${(m.documentContributionShare * 100).toFixed(1)}%`} />
                          <Stat label="Sessions" value={m.document?.sessionCount ?? 0} />
                          <Stat label="Retained Characters" value={(m.document?.retainedChars ?? 0).toLocaleString()} />
                          {(m.document?.importedRetainedChars ?? 0) > 0 && (
                            <Stat label="Imported Characters" value={(m.document!.importedRetainedChars).toLocaleString()} />
                          )}
                        </DetailSection>

                        <DetailSection
                          label="Blend Weights"
                          wide
                          tooltip={
                            <WeightList
                              header="How the combined share is built"
                              items={[
                                ["wGitHub", "weight applied to the GitHub share"],
                                ["wDocs", "weight applied to the Docs share"],
                              ]}
                            />
                          }
                        >
                          <Stat label="wGitHub" value={`${Math.round(m.wGitHub * 100)}%`} />
                          <Stat label="wDocs" value={`${Math.round(m.wDocs * 100)}%`} />
                        </DetailSection>
                      </div>
                    </td>
                  </tr>
                )}
                {expanded && variant !== "combined" && isDocumentMember(m) && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={4} className="px-6 py-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
                        <DetailSection
                          label="Activity"
                          wide
                          tooltip={
                            <WeightList
                              header="How activity is measured"
                              items={[
                                ["Sessions", "log-scaled (extra sessions add less over time)"],
                                ["Churn", "raw activity volume (not directly scored)"],
                                ["Active Days", "1 point per distinct day with a session"],
                              ]}
                            />
                          }
                        >
                          <Stat label="Sessions" value={m.sessionCount} />
                          <Stat label="Churn (chars)" value={m.churn.toLocaleString()} />
                          <Stat label="Active Days" value={m.activeDays} />
                        </DetailSection>

                        <DetailSection
                          label="Text Ownership"
                          wide
                          tooltip={
                            <WeightList
                              header="Retained text scoring"
                              items={[
                                ["Retained Characters", "chars this member wrote that survive in the current document"],
                                ["Self-Churn", "up to 0.5× penalty on own deleted text"],
                                ["Imported Characters", "of the above, how many came from a .docx import — see the Import disclosure note"],
                              ]}
                            />
                          }
                        >
                          <Stat label="Retained Characters" value={m.retainedChars.toLocaleString()} />
                          <Stat label="Self-Churn" value={`${(m.selfChurnRatio * 100).toFixed(1)}%`} />
                          {m.importedRetainedChars > 0 && (
                            <Stat label="Imported Characters" value={m.importedRetainedChars.toLocaleString()} />
                          )}
                        </DetailSection>

                        <DetailSection label="Timing" wide>
                          <Stat label="Last-Phase Ratio" value={`${(m.lastPhaseRatio * 100).toFixed(1)}%`} />
                        </DetailSection>

                        <DetailSection
                          label="Edit Significance"
                          wide
                          tooltip={
                            <WeightList
                              header="Edit type weight"
                              items={[
                                ["Substantive", "1.0× (new prose, original content)"],
                                ["Revision", "0.7× (meaningful rewrite of existing content)"],
                                ["Formatting", "0.3× (restructuring, reordering, spacing)"],
                                ["Trivial", "0.1× (typo/punctuation fixes)"],
                              ]}
                            />
                          }
                        >
                          <Stat label="Substantive" value={m.editTypeBreakdown.substantive} />
                          <Stat label="Revision"    value={m.editTypeBreakdown.revision} />
                          <Stat label="Formatting"  value={m.editTypeBreakdown.formatting} />
                          <Stat label="Trivial"     value={m.editTypeBreakdown.trivial} />
                        </DetailSection>
                      </div>
                    </td>
                  </tr>
                )}
                {expanded && variant !== "combined" && isGithubMember(m) && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={4} className="px-6 py-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-4">
                        <DetailSection
                          label="Activity"
                          wide
                          tooltip={
                            <WeightList
                              header="How activity is measured"
                              items={[
                                ["Commits", "log-scaled (extra commits add less over time)"],
                                ["Churn", "raw activity volume (not directly scored)"],
                                ["Active Days", "1 point per distinct day committed"],
                              ]}
                            />
                          }
                        >
                          <Stat label="Commits" value={m.commits} />
                          <Stat label="Churn" value={m.churn.toLocaleString()} />
                          <Stat label="Active Days" value={m.activeDays} />
                        </DetailSection>

                        <DetailSection
                          label="Significance"
                          wide
                          tooltip={
                            <WeightList
                              header="Line scoring weights"
                              items={[
                                ["Weighted Lines", "combined score after all weights applied"],
                                ["Self-Churn", "up to 0.5× penalty on own deleted lines"],
                                ["Code Lines Added", "1.0 per line (full score)"],
                                ["Comment Lines Added", "0.25 per line"],
                              ]}
                            />
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
                          wide
                          tooltip={
                            <WeightList
                              header="Commit impact multiplier"
                              items={[
                                ["Structural", "1.5× (major changes — highest weight)"],
                                ["Functional", "1.0× (normal code changes)"],
                                ["Cosmetic", "0.5× (formatting, whitespace)"],
                                ["Trivial", "0.2× (very small changes)"],
                              ]}
                            />
                          }
                        >
                          <Stat label="Structural" value={m.commitImpactBreakdown.structural} />
                          <Stat label="Functional"  value={m.commitImpactBreakdown.functional} />
                          <Stat label="Cosmetic"    value={m.commitImpactBreakdown.cosmetic} />
                          <Stat label="Trivial"     value={m.commitImpactBreakdown.trivial} />
                        </DetailSection>

                        <DetailSection
                          label="File Types"
                          wide
                          tooltip={
                            <WeightList
                              header="File weight per line"
                              items={[
                                ["src", "1.0 per line (source code — full score)"],
                                ["test", "0.8 per line"],
                                ["style", "0.7 per line"],
                                ["docs", "0.6 per line"],
                                ["config", "0.3 per line"],
                                ["other", "0.0 per line (auto-generated, not counted)"],
                              ]}
                            />
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
