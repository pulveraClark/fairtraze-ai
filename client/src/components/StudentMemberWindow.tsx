import { useEffect, useRef } from "react";
import type { Flag } from "@shared/types";
import { Modal, FOCUS_LIGHT } from "./ui";
import { Avatar } from "./Avatar";
import { FlagTag } from "./FlagTag";
import { NoActivityPill } from "./NoActivityPill";
import { Row, ShareBar } from "./report/DrawerParts";
import { WorkSummaryBlock } from "./report/AiWorkSummary";
import { InfoTip } from "./ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";
import { taskCountLabel } from "../lib/tasks/countLabel";
import { studentFlagLabel } from "../lib/studentDisplay";
import { summaryFor, type AiReviewResponse } from "../lib/aiReview";

/**
 * One member's window on the student side: the same dialog as the instructor's member window (full screen under
 * 640px, previous/next arrows, Esc returns focus), but showing only the AI findings with "See evidence", the
 * shares, the flags and the tasks. No commit impact, no raw numbers. A leader opens any member and gets the
 * arrows; a member opens only their own row, with no arrows. Display only: nothing here is a score.
 */
export interface StudentMemberView {
  userId: number;
  name: string;
  isLeader: boolean;
  functionalRoles: string[];
  avatarUpdatedAt: string | null;
  contributionShare: number | null;
  githubContributionShare: number | null;
  documentContributionShare: number | null;
  flags: string[];
  /** Not known for a member's own window (the tasks counts come with the leader's team view). */
  tasks: { open: number; done: number } | null;
}

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const uniqueByLabel = (flags: string[]) => flags.filter((f, i) => flags.findIndex((g) => studentFlagLabel(g) === studentFlagLabel(f)) === i);

const NAV_BUTTON = `flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-transparent ${FOCUS_LIGHT}`;

function NavArrow({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={dir === "prev" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && !!el.tagName && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function StudentMemberWindow({
  member, members, currentUserId, memberCount, sourceType, noActivity, ai, onSelect, onClose, restoreFocusTo,
}: {
  member: StudentMemberView;
  /** Every member the viewer may step through; one entry (themselves) for a plain member, so no arrows. */
  members: StudentMemberView[];
  currentUserId?: number;
  memberCount: number;
  sourceType: string;
  noActivity: boolean;
  ai: AiReviewResponse | null;
  onSelect: (userId: number) => void;
  onClose: () => void;
  restoreFocusTo?: HTMLElement | null;
}) {
  const index = members.findIndex((m) => m.userId === member.userId);
  const hasNav = members.length > 1 && index >= 0;
  const canPrev = hasNav && index > 0;
  const canNext = hasNav && index < members.length - 1;
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const go = useRef({ canPrev, canNext, prev: () => {}, next: () => {} });
  go.current = {
    canPrev, canNext,
    prev: () => onSelect(members[index - 1]!.userId),
    next: () => onSelect(members[index + 1]!.userId),
  };

  // ←/→ move between members; never while typing, with modifiers, or while a tooltip is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isEditableTarget(e.target) || document.querySelector('[role="tooltip"]')) return;
      if (e.key === "ArrowLeft" && go.current.canPrev) { e.preventDefault(); go.current.prev(); }
      if (e.key === "ArrowRight" && go.current.canNext) { e.preventDefault(); go.current.next(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // A button that becomes disabled (first/last member) would drop focus to the page; hand it to the other arrow.
  useEffect(() => {
    const active = document.activeElement as HTMLButtonElement | null;
    if (active && active !== document.body && active.isConnected && !active.disabled) return;
    (canNext ? nextRef.current : canPrev ? prevRef.current : null)?.focus();
  }, [index, canPrev, canNext]);

  const combined = sourceType === "COMBINED";
  const equalPct = memberCount > 0 ? 100 / memberCount : null;
  const isYou = member.userId === currentUserId;
  const roles = member.functionalRoles.map((r) => (r === "DOCUMENTATION" ? "Documentation" : "Developer")).join(" · ");
  const summary = ai?.enabled ? summaryFor(ai, { userId: member.userId }) : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${member.name}${isYou ? " (you)" : ""}`}
      restoreFocusTo={restoreFocusTo}
      scrollKey={member.userId}
      heading={
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            userId={member.userId}
            name={member.name}
            avatarUpdatedAt={member.avatarUpdatedAt}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-900"
          />
          <div className="min-w-0">
            <h2 className="break-words text-lg font-semibold leading-snug text-slate-900">
              {member.name}{isYou ? <span className="ml-2 rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-900">You</span> : null}
              {member.isLeader ? <span className="ml-2 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-900">Leader</span> : null}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700">
              <span>{roles || "No role set"}</span>
              {hasNav && <span className="tabular-nums">Member {index + 1} of {members.length}</span>}
            </div>
          </div>
        </div>
      }
      actions={hasNav ? (
        <>
          <button ref={prevRef} type="button" disabled={!canPrev} onClick={() => go.current.prev()} aria-label="Previous member" className={NAV_BUTTON}><NavArrow dir="prev" /></button>
          <button ref={nextRef} type="button" disabled={!canNext} onClick={() => go.current.next()} aria-label="Next member" className={NAV_BUTTON}><NavArrow dir="next" /></button>
        </>
      ) : undefined}
      sidebar={
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="flex items-center gap-1 text-xs leading-normal text-slate-700">
              Contribution share
              {equalPct !== null && <InfoTip label="About the equal-share marker" helpHref={helpLink("shares")}>{TIPS.equalShareMember(equalPct, memberCount)}</InfoTip>}
            </p>
            {noActivity ? (
              <div className="mt-1"><NoActivityPill /></div>
            ) : (
              <>
                <p className="text-xl font-semibold tabular-nums leading-tight text-slate-900">{pct(member.contributionShare)}</p>
                {equalPct !== null && <p className="mt-1 text-xs leading-normal text-slate-700">Equal share for {memberCount} member{memberCount === 1 ? "" : "s"}: {equalPct.toFixed(1)}%</p>}
              </>
            )}
          </div>
          {!noActivity && combined && (
            <dl className="mt-3">
              <Row label="GitHub share" value={pct(member.githubContributionShare)} bar={member.githubContributionShare !== null ? <ShareBar pct={member.githubContributionShare * 100} fairPct={equalPct} /> : undefined} />
              <Row label="Docs share" value={pct(member.documentContributionShare)} bar={member.documentContributionShare !== null ? <ShareBar pct={member.documentContributionShare * 100} fairPct={equalPct} /> : undefined} />
            </dl>
          )}
          {!noActivity && (
            <div className="mt-4">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-900">Flags</h3>
              {member.flags.length === 0 ? (
                <p className="text-sm text-slate-700">No flags</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {uniqueByLabel(member.flags).map((f) => <FlagTag key={f} flag={f as Flag} view={isYou ? "own" : "peer"} />)}
                </div>
              )}
            </div>
          )}
          {member.tasks && (
            <div className="mt-4">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-900">Tasks</h3>
              <p className="text-sm tabular-nums text-slate-900">
                {member.tasks.open + member.tasks.done === 0 ? "No tasks" : taskCountLabel(member.tasks.done, member.tasks.open + member.tasks.done)}
              </p>
            </div>
          )}
        </>
      }
    >
      {hasNav && <p className="sr-only" role="status" aria-live="polite">Member {index + 1} of {members.length}: {member.name}</p>}
      <section aria-labelledby="student-member-ai-title" key={member.userId}>
        <h3 id="student-member-ai-title" className="flex items-center gap-1 text-sm font-semibold text-slate-900">
          What {isYou ? "you" : "this member"} worked on
          <InfoTip label="About the AI findings" helpHref={helpLink("ai")}>{TIPS.workSummary}</InfoTip>
        </h3>
        {summary && ai ? (
          <div className="mt-2"><WorkSummaryBlock summary={summary} data={ai} sourceType={sourceType} /></div>
        ) : (
          <p className="mt-2 text-sm leading-normal text-slate-700">
            {ai?.enabled ? "No AI findings for this member yet. They appear after your instructor generates them." : "AI findings are not turned on for this class."}
          </p>
        )}
      </section>
    </Modal>
  );
}
