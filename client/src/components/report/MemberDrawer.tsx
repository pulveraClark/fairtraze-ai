import { useState } from "react";
import type { ReactNode } from "react";
import type { AnyScoredMember, MemberRoleInfo, ScoringThresholds } from "@shared/types";
import { Drawer, StatusPill, BUTTON_SECONDARY, FOCUS_LIGHT } from "../ui";
import { PILL_TONES } from "../ui/StatusPill";
import { useAuthOptional } from "../../context/AuthContext";
import { DisclosureSection, HoverTip, Note, Row } from "./DrawerParts";
import {
  EDIT_LABEL, EDIT_MULTIPLIER, EDIT_ORDER, EDIT_TIP, IMPACT_TIP, PREDATES_MESSAGE, fileTypeRows, impactRows, impactTotal,
  readSectionOpen, scoreDriverSummary, writeSectionOpen,
} from "../../lib/memberBreakdown";
import { RoleChips } from "./MemberContributionList";
import { Avatar } from "../Avatar";
import { describeFlagRule, type DeadlineBasis, type FlagSource } from "../../lib/flagRules";
import { docsStatsOf, formatPct, githubStatsOf, isCombinedMember, roleInfoOf } from "../../lib/memberView";

type Outcome = "RESOLVED" | "DISMISSED";

interface Props {
  member: AnyScoredMember | null;
  onClose: () => void;
  restoreFocusTo?: HTMLElement | null;
  source: FlagSource;
  /** Thresholds that produced the stored report (scoringConfig), or null if the report has none. */
  thresholds: ScoringThresholds | null;
  deadlineBasis: DeadlineBasis | null;
  memberCount: number;
  memberRoles?: MemberRoleInfo[];
  disputed?: boolean;
  flagOutcomes?: Map<string, Outcome>;
  onOpenDisputes?: () => void;
  /** Opens the existing Scoring settings (closes the drawer first). */
  onOpenScoringSettings?: () => void;
}

export function NotAvailable({ children }: { children?: ReactNode }) {
  return <p className="text-sm leading-normal text-slate-700">Not available{children ? `: ${children}` : ""}</p>;
}

const n = (v: number) => v.toLocaleString();
const n1 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

const WEIGHT_TONE = { High: "green", Medium: "sky", Low: "amber", "Very low": "neutral" } as const;

const IMPORT_TIP = "Session credit includes an estimate based on import volume; active-day count reflects only the day of upload, not offline drafting time.";
const IMAGE_TIP = "Disclosed for context only — image insertions are never scored or counted toward contribution share.";

function InfoIcon() {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0 text-indigo-800" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 11v5M12 8h.01" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </svg>
  );
}

export function MemberDrawer(props: Props) {
  const { member, onClose } = props;
  if (!member) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  return <DrawerBody {...props} member={member} />;
}

function DrawerBody({
  member, onClose, restoreFocusTo, source, thresholds, deadlineBasis, memberRoles, disputed, flagOutcomes, onOpenDisputes,
  onOpenScoringSettings,
}: Props & { member: AnyScoredMember }) {
  const userId = useAuthOptional()?.user?.id ?? null;
  const [whereOpen, setWhereOpen] = useState(() => readSectionOpen(userId, "where", true));
  const [impactOpen, setImpactOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  const info = roleInfoOf(member, memberRoles);
  const gh = githubStatsOf(member);
  const docs = docsStatsOf(member);
  const combined = isCombinedMember(member) ? member : null;
  const importedChars = docs && docs.importNote ? docs.importedRetainedChars : 0;
  const images = docs?.insertedImageCount ?? 0;
  const notes = info?.mismatchNotes ?? [];
  const tasks = info?.taskSummary;
  const summary = scoreDriverSummary(member);
  const showGithub = source !== "document";
  const typeRows = fileTypeRows(gh);
  const impacts = impactRows(gh);
  const analyzedCommits = impactTotal(gh);
  const maxImpact = impacts ? Math.max(1, ...impacts.map((r) => r.count)) : 1;
  // Final-third share is the unified-timeline value for Combined members; Docs-only members show it in their Docs section.
  const finalThird = formatPct(member.lastPhaseRatio);
  const docsShowsFinalThird = !gh;

  return (
    <Drawer open onClose={onClose} title={member.studentName} restoreFocusTo={restoreFocusTo} subtitle={
        <span className="flex items-center gap-3">
          <Avatar
            userId={info?.userId}
            name={member.studentName}
            avatarUpdatedAt={info?.avatarUpdatedAt}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-900"
          />
          <RoleChips info={info} />
        </span>
      }>
      {/* Always visible */}
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="text-xs leading-normal text-slate-700">Contribution share</p>
        <p className="text-xl font-semibold tabular-nums leading-tight text-slate-900">{formatPct(member.contributionShare)}</p>
      </div>
      {combined && (
        <dl className="mt-3">
          <Row label="GitHub share" value={formatPct(combined.githubContributionShare)} />
          <Row label="Docs share" value={formatPct(combined.documentContributionShare)} />
          <Row label="Blend weights (GitHub / Docs)" value={`${Math.round(combined.wGitHub * 100)}% / ${Math.round(combined.wDocs * 100)}%`} />
        </dl>
      )}

      {summary && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-indigo-50 px-3 py-2.5 text-sm leading-normal text-slate-900">
          <InfoIcon />
          <p><span className="font-semibold">{summary.lead}</span>{summary.rest}</p>
        </div>
      )}

      <div className="mt-4 pb-4">
        <h3 className="mb-1.5 text-sm font-semibold text-slate-900">Flags</h3>
        {member.flags.length === 0 ? (
          <p className="text-sm text-slate-800">No flags</p>
        ) : (
          <ul className="space-y-3">
            {member.flags.map((f) => {
              const rule = describeFlagRule(f, thresholds, source, deadlineBasis);
              const outcome = flagOutcomes?.get(f);
              return (
                <li key={f}>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill kind="flag" value={f} />
                    {outcome === "RESOLVED" && <StatusPill kind="status" tone="green" label="Reviewed: accepted" />}
                    {outcome === "DISMISSED" && <StatusPill kind="status" tone="neutral" label="Reviewed: upheld" />}
                  </div>
                  {rule && (
                    <p className="mt-1 text-sm leading-normal text-slate-700">
                      <span className="font-semibold">How this flag is defined: </span>{rule}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {disputed && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill kind="status" tone="violet" label="Open dispute" />
            {onOpenDisputes && <button type="button" onClick={onOpenDisputes} className={BUTTON_SECONDARY}>View disputes</button>}
          </div>
        )}
        {(notes.length > 0 || (tasks && tasks.total > 0) || importedChars > 0 || images > 0) && (
          <div className="mt-3 space-y-1 text-sm leading-normal text-slate-800">
            {notes.map((note) => <p key={note}><span className="font-semibold">Context: </span>{note}</p>)}
            {tasks && tasks.total > 0 && <p><span className="font-semibold">Tasks: </span>{tasks.completed} of {tasks.total} completed</p>}
            {importedChars > 0 && (
              <p className="flex flex-wrap items-center gap-x-1">
                <span><span className="font-semibold">Import: </span>{n(importedChars)} characters imported from .docx</span>
                <HoverTip label="About this import">{IMPORT_TIP}</HoverTip>
              </p>
            )}
            {images > 0 && (
              <p className="flex flex-wrap items-center gap-x-1">
                <span><span className="font-semibold">Images: </span>{images} image{images === 1 ? "" : "s"} inserted</span>
                <HoverTip label="About inserted images">{IMAGE_TIP}</HoverTip>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Collapsible sections */}
      {showGithub && (
        <>
          <DisclosureSection
            title="Where the work went"
            subtitle="File types changed and how much each counts"
            open={whereOpen}
            onToggle={(next) => { setWhereOpen(next); writeSectionOpen(userId, "where", next); }}
          >
            {typeRows ? (
              <>
                <div
                  role="img"
                  aria-label={`Lines added by file type: ${typeRows.map((r) => `${r.name} ${Math.round(r.pct)}%`).join(", ")}`}
                  className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
                >
                  {typeRows.map((r) => <span key={r.key} style={{ width: `${r.pct}%`, backgroundColor: r.color }} />)}
                </div>
                <table className="mt-3 w-full text-sm leading-normal">
                  <thead>
                    <tr className="text-left text-xs text-slate-700">
                      <th scope="col" className="py-1 pr-2 font-medium">File type</th>
                      <th scope="col" className="py-1 pr-2 text-right font-medium">Lines added</th>
                      <th scope="col" className="py-1 font-medium">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeRows.map((r) => (
                      <tr key={r.key} className="border-t border-slate-100">
                        <td className="py-1.5 pr-2">
                          <span className="inline-flex items-center gap-2">
                            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: r.color }} />
                            <span className="text-slate-900">{r.name}</span>
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-slate-900">{n(r.lines)}</td>
                        <td className="py-1.5">
                          <span className="inline-flex items-center gap-1">
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${PILL_TONES[WEIGHT_TONE[r.label]].cls}`}>{r.label}</span>
                            <HoverTip label={`About the weight for ${r.name}`}>
                              {r.weight.toFixed(1)}× per line. {r.reason}. Weights used by the current scoring model.
                            </HoverTip>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Note>Based on up to 100 commits per member. Generated files such as lock files are not counted (0.0×).</Note>
                {onOpenScoringSettings && (
                  <button
                    type="button"
                    onClick={onOpenScoringSettings}
                    className={`mt-2 inline-flex min-h-9 items-center rounded-lg text-sm font-semibold text-indigo-800 underline ${FOCUS_LIGHT}`}
                  >
                    How weights work · Scoring settings
                  </button>
                )}
              </>
            ) : (
              <NotAvailable>{gh ? PREDATES_MESSAGE : "no GitHub data for this member in the stored report."}</NotAvailable>
            )}
          </DisclosureSection>

          <DisclosureSection title="Commit impact" subtitle="How meaningful each commit was, regardless of file type" open={impactOpen} onToggle={setImpactOpen}>
            {impacts && gh ? (
              <>
                <p className="mb-2 text-sm leading-normal text-slate-800">
                  <span className="font-semibold tabular-nums text-slate-900">{analyzedCommits}</span> commit{analyzedCommits === 1 ? "" : "s"} analyzed
                </p>
                <ul className="space-y-1.5">
                  {impacts.map((r) => (
                    <li key={r.key} className="grid grid-cols-[8rem_minmax(0,1fr)_2rem_2.5rem] items-center gap-2 text-sm leading-normal">
                      <span className="inline-flex items-center gap-1 text-slate-900">
                        {r.label}
                        <HoverTip label={`About ${r.label} commits`}>{IMPACT_TIP[r.key]}</HoverTip>
                      </span>
                      <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <span className="block h-full rounded-full bg-indigo-600" style={{ width: `${(r.count / maxImpact) * 100}%` }} />
                      </span>
                      <span className="text-right font-semibold tabular-nums text-slate-900">{r.count}</span>
                      <span className="text-right text-xs tabular-nums text-slate-700">{r.multiplier.toFixed(1)}×</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 border-t border-slate-200 pt-2">
                  <Row label="Self-churn" value={formatPct(gh.selfChurnRatio)} />
                </dl>
                <Note>Merge commits are excluded because they repeat teammates' work.</Note>
                <Note>
                  Based on up to 100 commits per member. Commit counts are log-scaled, so many tiny commits don't outweigh a few large ones.
                  Self-churn applies up to a 50% penalty to lines the member later deleted themselves.
                </Note>
              </>
            ) : (
              <NotAvailable>{gh ? PREDATES_MESSAGE : "no GitHub data for this member in the stored report."}</NotAvailable>
            )}
          </DisclosureSection>

          <DisclosureSection title="Raw numbers" subtitle="Totals from GitHub" open={rawOpen} onToggle={setRawOpen}>
            {gh ? (
              <>
                <dl>
                  <Row
                    label="Lines added"
                    value={gh.weightedAdditions === undefined ? n(gh.additions) : `${n(gh.additions)} raw · ${n1(gh.weightedAdditions)} weighted`}
                  />
                  <Row label="Lines deleted" value={n(gh.deletions)} />
                  <Row label="Churn" value={n(gh.churn)} />
                  <Row label="Code lines added" value={n(gh.codeLinesAdded)} />
                  <Row label="Comment lines added" value={n(gh.commentLinesAdded)} />
                  {gh.blankLinesAdded !== undefined && <Row label="Blank lines added" value={n(gh.blankLinesAdded)} />}
                  <Row label="Commits" value={n(gh.commits)} />
                  <Row label="Active days" value={n(gh.activeDays)} />
                  <Row label="Share of activity in the final third" value={finalThird} />
                </dl>
                {analyzedCommits > 0 && analyzedCommits !== gh.commits && (
                  <Note>
                    Commits is the total from GitHub's contributor statistics, which is what scoring uses. Commit impact counts the {analyzedCommits} commits
                    that were analyzed (up to 100), which can differ from that total.
                  </Note>
                )}
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2.5 text-xs leading-normal text-amber-900">
                  <WarnIcon />
                  <p>Raw lines are GitHub's totals and include generated files such as lock files, which are not counted in the weighted score.</p>
                </div>
              </>
            ) : (
              <NotAvailable>no GitHub data for this member in the stored report.</NotAvailable>
            )}
          </DisclosureSection>
        </>
      )}

      {source === "github" ? (
        <div className="border-t border-slate-200 py-3 text-sm leading-normal text-slate-800">
          <span className="font-semibold text-slate-900">FairTraze Docs activity</span> — Not used in this project
        </div>
      ) : (
        <DisclosureSection title="FairTraze Docs activity" subtitle="Writing and editing in the shared document" open={docsOpen} onToggle={setDocsOpen}>
          {docs ? (
            <>
              <dl>
                <Row label="Editing sessions" value={n(docs.sessionCount)} />
                <Row label="Churn (characters)" value={n(docs.churn)} />
                <Row label="Active days" value={n(docs.activeDays)} />
                <Row label="Retained characters" value={n(docs.retainedChars)} />
                <Row label="Characters inserted" value={n(docs.totalInsertedChars)} />
                <Row label="Characters deleted" value={n(docs.totalDeletedChars)} />
                <Row label="Weighted retained characters" value={n1(docs.weightedRetainedChars)} />
                <Row label="Self-churn" value={formatPct(docs.selfChurnRatio)} />
                {docsShowsFinalThird && <Row label="Share of activity in the final third" value={finalThird} />}
              </dl>
              {docs.editTypeBreakdown ? (
                <>
                  <h4 className="mb-1 mt-3 text-sm font-semibold text-slate-900">Edit significance</h4>
                  <dl>
                    {EDIT_ORDER.map((k) => (
                      <Row
                        key={k}
                        label={`${EDIT_LABEL[k]} (${EDIT_MULTIPLIER[k].toFixed(1)}×)`}
                        tip={<HoverTip label={`About ${EDIT_LABEL[k]} edits`}>{EDIT_TIP[k]}</HoverTip>}
                        value={docs.editTypeBreakdown[k]}
                      />
                    ))}
                  </dl>
                </>
              ) : (
                <NotAvailable>{PREDATES_MESSAGE}</NotAvailable>
              )}
              {(importedChars > 0 || images > 0) && (
                <div className="mt-3 space-y-1 text-sm leading-normal text-slate-800">
                  {importedChars > 0 && <p><span className="font-semibold">Import: </span>{n(importedChars)} characters imported from .docx (session credit includes an estimate).</p>}
                  {images > 0 && <p><span className="font-semibold">Images: </span>{images} inserted (disclosed only, never scored).</p>}
                </div>
              )}
            </>
          ) : (
            <NotAvailable>no Docs data for this member in the stored report.</NotAvailable>
          )}
        </DisclosureSection>
      )}
    </Drawer>
  );
}
