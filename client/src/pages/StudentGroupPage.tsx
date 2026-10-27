import { HISTORY_HINT } from "../lib/docActionHints";
import { AppFooter } from "../components/AppFooter";
import { BUTTON_SECONDARY_COMPACT } from "../components/ui/styles";
import { classCrumb } from "../lib/classLabel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LastAnalyzed } from "../components/LastAnalyzed";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { requestReportRefresh } from "../lib/refreshReport";
import { useQueryClient } from "@tanstack/react-query";
import { Breadcrumbs } from "../components/layout/Breadcrumbs";
import { useAuth } from "../context/AuthContext";
import { DocsDataApproximateNotice } from "../components/DocsDataApproximateNotice";
import {
  ApiError, classKeys, disputeKeys, groupKeys,
  useGroupSetupQuery, useGroupTasksQuery, useMyDisputesQuery, useStudentGroupQuery,
} from "../hooks/useGroupQueries";
import { useInvalidateOnAlertCount } from "../hooks/useInvalidateOnAlertCount";
import { useRouter } from "../router";
import { StudentNoteCard } from "../components/StudentNoteCard";
import { NoActivityPill } from "../components/NoActivityPill";
import { quietSourceText } from "../lib/groupActivity";
import { NOTE_STATUS, sortNotes } from "../lib/notes";
import { DocumentGate } from "../components/DocumentGate";
import { DocumentHistoryPanel } from "../components/DocumentHistoryPanel";
import { GroupManageModal } from "../components/GroupManageModal";
import { TasksTab } from "../components/tasks/TasksTab";
import { LinkedHeadingNotice } from "../components/tasks/details/LinkedHeadingNotice";
import { useDocHeadingFocus } from "../hooks/useDocHeadingFocus";
import { DocSectionProvider, useDocSectionNav } from "../hooks/useDocSectionLink";
import { FlagTag } from "../components/FlagTag";
import { BriefModal } from "../components/BriefCard";
import { InfoTip } from "../components/ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";
import { studentHealthLabel, evennessLine } from "../lib/studentDisplay";
import { groupTabs, resolveTab, tabFromSearch, type GroupTab } from "../lib/groupTabs";
import { YourShareTile } from "../components/YourShareTile";
import type { BriefAttachment } from "../lib/briefAttachments";
import { RULES_OUTDATED_STUDENT_NOTICE } from "@shared/scoringRules";
import { SetupNudgeBar } from "../components/SetupNudgeBar";
import { SetupGate } from "../components/SetupGate";
import { readSetupSkipped, storeSetupSkipped, readSetupCompleteShown, storeSetupCompleteShown } from "../lib/setupSkip";
import { useToast } from "../components/Toast";
import { NextStepLine } from "../components/NextStepLine";
import { deriveSetupProgress, setupCardVisible, setupGateVisible } from "../lib/groupSetup";
import { nextStepText } from "../lib/nextStep";
import { LeaderTeamCard, type LeaderTeamMember } from "../components/LeaderTeamCard";
import ReactMarkdown from "react-markdown";
import { AiBadge } from "../components/ui/AiBadge";
import { BriefCheckWithMarks } from "../components/BriefCheckWithMarks";
import { RefreshFailedNote } from "../components/RefreshFailedNote";
import { StudentMemberWindow, type StudentMemberView } from "../components/StudentMemberWindow";
import { useAiReview } from "../hooks/useAiReview";
import { getContributionStatsCards, scoreBlendLine, type MyContribution } from "../lib/contributionStats";

// ── Types ─────────────────────────────────────────────────────────────────────
interface RoleSuggestionData {
  id:             number;
  suggestedRoles: string[];
  status:         "PENDING" | "ACCEPTED" | "DECLINED";
  createdAt:      string;
}

interface GroupDetail {
  classSection: { id: number; subjectCode: string; subjectName: string; department: { id: number; name: string; code: string } | null; edpCode: string; };
  assignment:   { id: number; title: string; deadline: string | null; sourceType: string; description: string | null; attachments: BriefAttachment[]; };
  project:      { id: number; groupName: string; repoUrl: string | null; };
  membership:   { role: "LEADER" | "MEMBER"; functionalRoles: string[]; joinedAt: string; roleSuggestion: RoleSuggestionData | null; };
  hasReport:    boolean;
  docsDataApproximate?: boolean;
  rulesOutdated?: boolean;
  docsDataFixedAt?: string;
  report: {
    teamHealth:  string;
    /** Server flag: no member has any recorded activity yet (display only). */
    noActivity?: boolean;
    quietSource?: "GitHub" | "Docs" | null;
    analyzedAt:  string;
    trigger?:    "manual" | "auto" | null;
    memberCount: number;
    deadlineWindowBasis: "assignment-deadline" | "activity-span";
    myContribution: MyContribution | null;
    /** Present only when the caller is this group's leader (enforced server-side). */
    team?: LeaderTeamMember[];
    /** Leader only: the instructor's team-level AI explanation (without the Gini sentence). */
    narrative?: string | null;
    narrativeOutdated?: boolean;
  } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const HEALTH_BADGE: Record<string, string> = {
  "Healthy":       "text-emerald-700 bg-emerald-50 border-emerald-200",
  "Moderate Risk": "text-amber-700 bg-amber-50 border-amber-200",
  "High Risk":     "text-red-700 bg-red-50 border-red-200",
};

const SOURCE_LABEL: Record<string, string> = {
  GITHUB:   "GitHub",
  EDITOR:   "FairTraze Docs",
  COMBINED: "GitHub + Docs",
};

const FLAG_DESCRIPTIONS: Record<string, string> = {
  "deadline-driven": "Most of your recorded activity (commits or document edits) happened in the last third of the time before the deadline.",
  "free-rider":      "Your share of the recorded work is below the low-contribution level for this project (half of an equal split, unless your instructor changed it).",
  "inactive":        "No recorded activity (commits or document edits) was found in the analyzed period.",
  "overload":        "Your share of the recorded work is well above an equal split, which may mean the workload is uneven.",
};

type Tab = GroupTab;

// ── Dispute types ─────────────────────────────────────────────────────────────
interface DisputeRecord {
  id:                 number;
  projectId:          number;
  status:             "OPEN" | "RESOLVED" | "DISMISSED";
  reason:             string;
  instructorResponse: string | null;
  disputedFlags:      string; // JSON array of flags captured at submission; "" = legacy (all flags)
  createdAt:          string;
  resolvedAt:         string | null;
}

function getFlagDisputeOutcome(flag: string, dispute: DisputeRecord | null | undefined): "RESOLVED" | "DISMISSED" | null {
  if (!dispute || dispute.status === "OPEN") return null;
  const flags: string[] = (() => {
    try { return dispute.disputedFlags ? (JSON.parse(dispute.disputedFlags) as string[]) : []; }
    catch { return []; }
  })();
  // Empty = legacy dispute — applies badge to all flags
  if (flags.length === 0 || flags.includes(flag)) return dispute.status as "RESOLVED" | "DISMISSED";
  return null;
}

const DISPUTE_STATUS_STYLE: Record<string, string> = {
  OPEN:      "text-amber-700 bg-amber-50 border-amber-200",
  RESOLVED:  "text-emerald-700 bg-emerald-50 border-emerald-200",
  DISMISSED: "text-slate-600 bg-slate-100 border-slate-200",
};

// ── Dispute submission modal ───────────────────────────────────────────────────
function DisputeModal({
  projectId,
  token,
  onClose,
  onSubmitted,
}: {
  projectId: number;
  token:     string;
  onClose:   () => void;
  onSubmitted: (d: DisputeRecord) => void;
}) {
  const [reason,   setReason]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,    setError]    = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) { setError("Please describe the context for your instructor."); return; }
    setSubmitting(true);
    setError("");
    try {
      const res  = await fetch("/api/disputes", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ projectId, reason: reason.trim() }),
      });
      const json = await res.json() as DisputeRecord & { error?: string };
      if (!res.ok) { setError(json.error ?? "Could not send your note."); return; }
      onSubmitted(json);
    } catch {
      setError("Network error — could not submit.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Add a note</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Describe context for your instructor. They will review and respond.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <textarea
            ref={textareaRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="E.g. I was working offline and pushed everything at the end due to connectivity issues…"
            rows={5}
            maxLength={2000}
            className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Sending…" : "Send note"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const FUNCTIONAL_ROLE_META: Record<string, { label: string; activeClass: string; inactiveClass: string }> = {
  DEVELOPER:     { label: "Developer",     activeClass: "bg-indigo-50 border-indigo-300 text-indigo-700",  inactiveClass: "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600" },
  DOCUMENTATION: { label: "Documentation", activeClass: "bg-teal-50 border-teal-300 text-teal-700",        inactiveClass: "bg-white border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600" },
};

export function StudentGroupPage({ projectId }: { projectId: number }) {
  const { token, user } = useAuth();
  const { navigate }    = useRouter();
  const queryClient     = useQueryClient();
  const uid             = user?.id ?? null;

  // Server state lives in React Query. The group page itself reads the stored report only.
  const groupQuery    = useStudentGroupQuery<GroupDetail>(projectId);
  const tasksQuery    = useGroupTasksQuery(projectId);
  const disputesQuery = useMyDisputesQuery<DisputeRecord>();
  const setupQuery    = useGroupSetupQuery(projectId);
  // A notification (join accepted, role response, task assigned, report ready, dispute response…)
  // changes the unread count → refresh this user's group data and own disputes.
  useInvalidateOnAlertCount([groupKeys.all(uid), disputeKeys.mine(uid)]);

  const data    = groupQuery.data ?? null;

  // Open a report older than an hour in an active project: the server refreshes it in the background.
  // The page keeps showing the current report; the new one replaces it when it arrives.
  const { updating } = useAutoRefresh({
    key: projectId,
    enabled: !!data?.hasReport,
    analyzedAt: data?.report?.analyzedAt,
    request: () => requestReportRefresh(projectId, token),
    refetch: () => groupQuery.refetch(),
  });
  const loading = groupQuery.isLoading;
  const queryErr = groupQuery.error;
  const error   = data || !queryErr
    ? ""
    : queryErr instanceof ApiError ? queryErr.message : "Network error — could not load group.";
  const dispute: DisputeRecord | null | undefined = disputesQuery.isPending
    ? undefined
    : (disputesQuery.data?.find((d) => d.projectId === projectId) ?? null);

  const myNotes = useMemo(
    () => sortNotes((disputesQuery.data ?? []).filter((d) => d.projectId === projectId)),
    [disputesQuery.data, projectId],
  );

  // null = no ?tab= in the link: the first tab for this project (FairTraze Docs for students) is shown.
  const [activeTab, setActiveTab] = useState<Tab | null>(() => tabFromSearch(window.location.search));
  // A task notification links here with ?tab=tasks&task=<id> to open that task's panel.
  const initialTaskId = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get("task");
    const n = raw ? Number(raw) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  }, []);

  /** Switch tab and keep ?tab= (and ?task=) in the address bar, so a reload or shared link lands here. */
  function selectTab(tab: Tab, taskId: number | null = null) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    if (tab === "tasks" && taskId !== null) url.searchParams.set("task", String(taskId)); else url.searchParams.delete("task");
    window.history.replaceState(window.history.state, "", url);
  }
  const [viewingHistory, setViewingHistory]     = useState(false);
  // "Open in document" from a task: the editor scrolls to the task's linked heading.
  const docFocus = useDocHeadingFocus(() => { setViewingHistory(false); selectTab("document"); });
  // Evidence in the AI review links to a Docs section: same tab, with a history entry so Back returns.
  const docSection = useDocSectionNav(
    useCallback(() => { setViewingHistory(false); setActiveTab("document"); }, []),
    useCallback(() => setActiveTab(tabFromSearch(window.location.search)), []),
  );
  // A "join request" notification links here with ?manage=1 to open the manage modal.
  const [showManageModal, setShowManageModal]   = useState(
    () => new URLSearchParams(window.location.search).get("manage") === "1"
  );
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  // The AI findings and (for the leader) the instructions check; read here so the member window and the team card share one read.
  const ai = useAiReview(projectId, token);
  // Whose window is open (a leader opens anyone, a member only themselves), and the row that opened it.
  const [openMemberId, setOpenMemberId] = useState<number | null>(null);
  const memberOpener = useRef<HTMLElement | null>(null);
  // The sentence of the project instructions to mark when the window opens from the instructions check.
  const [briefHighlight, setBriefHighlight] = useState<string | null>(null);
  // Functional role suggestion state
  const myRoles      = data?.membership?.functionalRoles ?? [];
  const mySuggestion = data?.membership?.roleSuggestion ?? null;
  const [suggestDraft, setSuggestDraft]   = useState<string[]>([]);
  const [suggestBusy, setSuggestBusy]     = useState(false);
  const [suggestErr, setSuggestErr]       = useState("");
  // Seed the draft once per group so a background refetch never overwrites what the user is picking.
  const draftSeededFor = useRef<number | null>(null);
  useEffect(() => {
    if (data && draftSeededFor.current !== projectId) {
      draftSeededFor.current = projectId;
      setSuggestDraft(data.membership?.functionalRoles ?? []);
    }
  }, [data, projectId]);
  // Group name rename (leader only)
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft]     = useState("");
  const [groupNameBusy, setGroupNameBusy]       = useState(false);
  const [groupNameErr, setGroupNameErr]         = useState("");
  // My open tasks (read-only preview — the board lives on the Tasks tab)
  const myTasks = useMemo(
    () => (tasksQuery.data ?? []).filter((t) => t.assignedToUserId === user?.id && t.status !== "DONE"),
    [tasksQuery.data, user?.id]
  );

  // Leader's first-visit setup screen; "Do this later" is remembered per user and group.
  const [setupSkipped, setSetupSkipped] = useState(() => readSetupSkipped(uid, projectId));
  const refreshSetup = () => {
    void queryClient.invalidateQueries({ queryKey: groupKeys.setup(uid, projectId) });
    void queryClient.invalidateQueries({ queryKey: groupKeys.detail(uid, projectId) });
  };

  // "Setup complete ✓" is a toast, once, in the visit where this group goes from incomplete to complete.
  const { showSuccessToast } = useToast();
  const sawSetupIncomplete = useRef(false);
  useEffect(() => {
    const setup = setupQuery.data;
    if (!setup) return;
    if (setupCardVisible(setup)) { sawSetupIncomplete.current = true; return; }
    if (sawSetupIncomplete.current && deriveSetupProgress(setup).complete && !readSetupCompleteShown(uid, projectId)) {
      storeSetupCompleteShown(uid, projectId);
      showSuccessToast("Setup complete ✓");
    }
  }, [setupQuery.data, uid, projectId, showSuccessToast]);
  const setupComplete = !!setupQuery.data && deriveSetupProgress(setupQuery.data).complete;
  const nextStep = setupComplete ? nextStepText({ tasks: tasksQuery.data ?? [], userId: user?.id ?? null }) : null;

  // Not a member / group gone → back to the class list.
  useEffect(() => {
    if (queryErr instanceof ApiError && (queryErr.status === 403 || queryErr.status === 404)) navigate("/student");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryErr]);

  /** Patch the cached group detail in place (no refetch). */
  function patchDetail(fn: (d: GroupDetail) => GroupDetail) {
    queryClient.setQueryData<GroupDetail>(groupKeys.detail(uid, projectId), (d) => (d ? fn(d) : d));
  }

  async function handleSuggestRole() {
    if (!token) return;
    const st = data?.assignment?.sourceType ?? "GITHUB";
    const toSuggest = suggestDraft.filter((r) => {
      if (st === "GITHUB") return r === "DEVELOPER";
      if (st === "EDITOR") return r === "DOCUMENTATION";
      return true;
    });
    if (toSuggest.length === 0) return;
    setSuggestErr("");
    setSuggestBusy(true);
    try {
      const res  = await fetch(`/api/groups/${projectId}/role-suggestions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ suggestedRoles: toSuggest }),
      });
      const json = await res.json() as RoleSuggestionData & { error?: string };
      if (!res.ok) { setSuggestErr(json.error ?? "Could not submit suggestion."); return; }
      patchDetail((d) => ({
        ...d,
        membership: {
          ...d.membership,
          roleSuggestion: { id: json.id, suggestedRoles: json.suggestedRoles, status: "PENDING", createdAt: json.createdAt },
        },
      }));
    } catch {
      setSuggestErr("Network error — could not submit suggestion.");
    } finally {
      setSuggestBusy(false);
    }
  }

  function startEditGroupName() {
    if (!data) return;
    setGroupNameDraft(data.project.groupName);
    setGroupNameErr("");
    setEditingGroupName(true);
  }

  async function handleSaveGroupName() {
    if (!token || !data) return;
    const trimmed = groupNameDraft.trim();
    if (!trimmed) { setGroupNameErr("Group name is required."); return; }
    setGroupNameBusy(true);
    setGroupNameErr("");
    try {
      const res  = await fetch(`/api/groups/${projectId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ groupName: trimmed }),
      });
      const json = await res.json() as { groupName?: string; error?: string };
      if (!res.ok) { setGroupNameErr(json.error ?? "Could not update name."); return; }
      patchDetail((d) => ({ ...d, project: { ...d.project, groupName: json.groupName ?? trimmed } }));
      setEditingGroupName(false);
    } catch {
      setGroupNameErr("Network error — could not update name.");
    } finally {
      setGroupNameBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <main className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="h-4 w-4 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
            Loading…
          </div>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-sm text-red-600">{error || "Group not found."}</p>
            <button
              onClick={() => navigate("/student")}
              className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-600 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to My Classes
            </button>
          </div>
        </main>
      </div>
    );
  }

  const { classSection, assignment, project, membership, hasReport, report } = data;

  const sourceType = assignment.sourceType;
  const isLeader = membership.role === "LEADER";
  const visibleTabs: Tab[] = groupTabs("student", sourceType);
  const effectiveTab: Tab = resolveTab(activeTab, visibleTabs);

  if (setupQuery.data && setupGateVisible(setupQuery.data, setupSkipped)) {
    return (
      <SetupGate
        groupName={project.groupName}
        projectId={projectId}
        setup={setupQuery.data}
        token={token}
        onSaved={refreshSetup}
        onSkip={() => { storeSetupSkipped(uid, projectId); setSetupSkipped(true); }}
        onBack={() => navigate("/student")}
      />
    );
  }


  return (
    <DocSectionProvider value={docSection.open}>
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {showManageModal && (
        <GroupManageModal
          projectId={projectId}
          isInstructor={false}
          onClose={() => setShowManageModal(false)}
          onChanged={() => {
            setShowManageModal(false);
            void queryClient.invalidateQueries({ queryKey: groupKeys.all(uid) });
            void queryClient.invalidateQueries({ queryKey: classKeys.all(uid) });
          }}
        />
      )}

      {openMemberId !== null && report && (() => {
        const views: StudentMemberView[] = report.team
          ? report.team.map((m) => ({ ...m, tasks: m.tasks }))
          : report.myContribution && user
            ? [{
                userId: user.id, name: user.name, isLeader, functionalRoles: membership.functionalRoles, avatarUpdatedAt: null,
                contributionShare: report.myContribution.contributionShare,
                githubContributionShare: "githubContributionShare" in report.myContribution ? report.myContribution.githubContributionShare : null,
                documentContributionShare: "documentContributionShare" in report.myContribution ? report.myContribution.documentContributionShare : null,
                flags: report.myContribution.flags, tasks: null,
              }]
            : [];
        // A member opens only their own row; a leader any row. Anything else closes the window.
        const open = views.find((v) => v.userId === openMemberId && (isLeader || v.userId === user?.id));
        if (!open) return null;
        return (
          <StudentMemberWindow
            member={open}
            members={isLeader ? views : [open]}
            currentUserId={user?.id}
            memberCount={report.memberCount}
            sourceType={sourceType}
            noActivity={!!report.noActivity}
            ai={ai.data}
            onSelect={setOpenMemberId}
            onClose={() => setOpenMemberId(null)}
            restoreFocusTo={memberOpener.current}
          />
        );
      })()}

      {showBrief && (
        <BriefModal
          assignmentId={assignment.id}
          title={assignment.title}
          description={assignment.description}
          attachments={assignment.attachments}
          highlight={briefHighlight}
          onClose={() => { setShowBrief(false); setBriefHighlight(null); }}
        />
      )}

      {showDisputeModal && token && (
        <DisputeModal
          projectId={projectId}
          token={token}
          onClose={() => setShowDisputeModal(false)}
          onSubmitted={(d) => {
            queryClient.setQueryData<DisputeRecord[]>(disputeKeys.mine(uid), (old) => [d, ...(old ?? [])]);
            void queryClient.invalidateQueries({ queryKey: disputeKeys.mine(uid) });
            setShowDisputeModal(false);
          }}
        />
      )}

      {/* Page header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <Breadcrumbs
              items={[
                { label: "Dashboard", href: "/student" },
                classCrumb(classSection, `/student/class/${classSection.id}`),
                { label: project.groupName },
              ]}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {editingGroupName ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={groupNameDraft}
                      onChange={(e) => { setGroupNameDraft(e.target.value); setGroupNameErr(""); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleSaveGroupName();
                        if (e.key === "Escape") setEditingGroupName(false);
                      }}
                      disabled={groupNameBusy}
                      className="text-sm font-semibold text-slate-800 border border-indigo-300 rounded-lg px-2 py-1 max-w-[220px] focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
                    />
                    <button
                      onClick={() => void handleSaveGroupName()}
                      disabled={groupNameBusy}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 px-1.5 py-1 rounded hover:bg-emerald-50 transition-colors disabled:opacity-50"
                    >
                      {groupNameBusy ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingGroupName(false)}
                      disabled={groupNameBusy}
                      className="text-xs text-slate-600 hover:text-slate-600 px-1.5 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <h1 className="text-xl font-semibold text-slate-900 truncate">{project.groupName}</h1>
                    {membership.role === "LEADER" && (
                      <button
                        onClick={startEditGroupName}
                        title="Rename group"
                        aria-label="Rename group"
                        className="ft-hit shrink-0 w-3.5 h-3.5 rounded-full text-slate-500 hover:text-indigo-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 transition-colors"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
                <span className="text-xs font-bold text-slate-600 bg-slate-100 rounded px-1.5 py-0.5 tracking-wide uppercase shrink-0">
                  {SOURCE_LABEL[assignment.sourceType] ?? assignment.sourceType}
                </span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                  membership.role === "LEADER"
                    ? "text-indigo-700 bg-indigo-50 border-indigo-200"
                    : "text-slate-500 bg-white border-slate-200"
                }`}>
                  {membership.role === "LEADER" ? "Leader" : "Member"}
                </span>
              </div>
              {editingGroupName && groupNameErr && (
                <p className="text-xs text-red-600 mt-1">{groupNameErr}</p>
              )}
              <p className="text-sm text-slate-600 mt-0.5">
                {classSection.subjectName}
                {assignment.deadline && (
                  <> · Due {new Date(assignment.deadline).toLocaleDateString()}</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(assignment.description || assignment.attachments.length > 0) && (
              <button
                type="button"
                onClick={() => setShowBrief(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:border-slate-300 text-sm font-medium transition-colors"
              >
                Instructions
              </button>
            )}
            <button
              onClick={() => setShowManageModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:border-slate-300 text-sm font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
              Manage Group
            </button>
            {report?.noActivity ? (
              <NoActivityPill />
            ) : report?.teamHealth && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${HEALTH_BADGE[report.teamHealth] ?? ""}`}>
                {studentHealthLabel(report.teamHealth)}
              </span>
            )}
          </div>
        </div>

        {/* Setup nudge: one slim line above the tabs on every tab while setup is incomplete */}
        <div className={`${effectiveTab === "tasks" ? "max-w-7xl" : "max-w-5xl"} mx-auto px-6 sm:px-8`}>
          <SetupNudgeBar projectId={projectId} setup={setupQuery.data} token={token} onSaved={refreshSetup} />
        </div>

        {/* Tab bar */}
        {visibleTabs.length > 1 && (
          <div role="tablist" aria-label="Group sections" className={`${effectiveTab === "tasks" ? "max-w-7xl" : "max-w-5xl"} mx-auto px-6 sm:px-8 flex border-t border-slate-100`}>
            {visibleTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={effectiveTab === tab}
                onClick={() => selectTab(tab)}
                className={`px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                  effectiveTab === tab
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab === "report" ? "Report" : tab === "tasks" ? "Tasks" : "FairTraze Docs"}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className={`flex-1 ${effectiveTab === "tasks" ? "max-w-7xl" : "max-w-5xl"} w-full mx-auto px-6 sm:px-8 py-8 min-w-0`}>

        {/* Setup done: the same slot becomes one calm line (hidden when there is nothing useful to say) */}
        {effectiveTab !== "tasks" && <NextStepLine text={nextStep} onOpenTasks={nextStep?.startsWith("You have") ? () => selectTab("tasks") : undefined} />}

        {/* ── Your tasks widget ───────────────────────────────────────────────── */}
        {myTasks.length > 0 && effectiveTab !== "tasks" && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className="text-xs font-semibold text-slate-700">
                Your tasks
                <span className="ml-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-full px-1.5 py-0.5">
                  {myTasks.length}
                </span>
              </h2>
              <button
                onClick={() => selectTab("tasks")}
                className="ft-hit rounded px-2 text-xs text-indigo-700 hover:underline font-medium shrink-0"
              >
                Open Tasks tab
              </button>
            </div>
            <ul className="space-y-1">
              {myTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="truncate"><span className="font-semibold tabular-nums">{t.key}</span> {t.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Tasks tab ────────────────────────────────────────────────────────── */}
        {effectiveTab === "tasks" && (
          <TasksTab
            projectId={projectId}
            initialTaskId={initialTaskId}
            onOpenTaskChange={(id) => selectTab("tasks", id)}
            onOpenDocument={visibleTabs.includes("document") ? docFocus.openAt : undefined}
          />
        )}

        {/* ── Report tab ───────────────────────────────────────────────────────── */}
        {effectiveTab === "report" && (
          <div className="space-y-6">

            {/* Your Role */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Your Role</h3>

              {/* Current applied role (always shown, read-only) */}
              <div className="mb-3">
                <div className="text-xs text-slate-600 mb-1.5 flex items-center gap-1">
                  {membership.role === "LEADER" ? "Your assigned role" : "Role assigned by your leader"}
                  <InfoTip label="About roles" helpHref={helpLink("roles")}>
                    {membership.role === "LEADER" ? TIPS.rolesLeader : TIPS.roles}
                  </InfoTip>
                </div>
                <div className="flex items-center flex-wrap gap-2">
                  {myRoles.length === 0 ? (
                    <span className="text-xs text-slate-600 italic">No role assigned yet</span>
                  ) : (
                    myRoles.map((role) => {
                      const meta = FUNCTIONAL_ROLE_META[role];
                      if (!meta) return null;
                      return (
                        <span key={role} className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${meta.activeClass}`}>
                          ✓ {meta.label}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Member: suggestion flow — only meaningful when the assignment has more than one valid role to choose from */}
              {membership.role === "MEMBER" && (sourceType === "COMBINED" || mySuggestion?.status === "PENDING") && (
                <div className="border-t border-slate-100 mt-3 pt-3">
                  {suggestErr && <p className="text-xs text-red-600 mb-2">{suggestErr}</p>}

                  {mySuggestion?.status === "PENDING" ? (
                    /* Pending — awaiting leader action */
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-0.5">
                        PENDING
                      </span>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Your suggestion (
                        <span className="font-medium">
                          {mySuggestion.suggestedRoles
                            .map((r) => FUNCTIONAL_ROLE_META[r]?.label ?? r)
                            .join(" + ")}
                        </span>
                        ) is awaiting your leader's approval.
                      </p>
                    </div>
                  ) : (
                    /* Suggest / re-suggest flow */
                    <>
                      {mySuggestion?.status === "ACCEPTED" && (
                        <p className="text-xs text-emerald-600 mb-2">✓ Your last suggestion was accepted.</p>
                      )}
                      {mySuggestion?.status === "DECLINED" && (
                        <p className="text-xs text-red-600 mb-2">Your last suggestion was declined. You can suggest again.</p>
                      )}

                      <p className="text-xs text-slate-500 mb-2">
                        Suggest a role to your leader for approval:
                      </p>

                      {/* Toggle chips — local draft, not applied until submitted */}
                      <div className="flex items-center flex-wrap gap-2 mb-3">
                        {(Object.keys(FUNCTIONAL_ROLE_META) as string[])
                          .filter((role) => {
                            if (sourceType === "GITHUB") return role === "DEVELOPER";
                            if (sourceType === "EDITOR") return role === "DOCUMENTATION";
                            return true;
                          })
                          .map((role) => {
                            const selected = suggestDraft.includes(role);
                            const meta     = FUNCTIONAL_ROLE_META[role]!;
                            const next     = selected
                              ? suggestDraft.filter((r) => r !== role)
                              : [...suggestDraft, role];
                            return (
                              <button
                                key={role}
                                disabled={suggestBusy}
                                onClick={() => setSuggestDraft(next)}
                                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                                  selected ? meta.activeClass : meta.inactiveClass
                                }`}
                              >
                                {selected ? `✓ ${meta.label}` : meta.label}
                              </button>
                            );
                          })}
                      </div>

                      <button
                        onClick={() => void handleSuggestRole()}
                        disabled={
                          suggestBusy ||
                          suggestDraft.length === 0 ||
                          JSON.stringify([...suggestDraft].sort()) === JSON.stringify([...myRoles].sort())
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {suggestBusy ? (
                          <>
                            <span className="h-2.5 w-2.5 rounded-full border border-indigo-300 border-t-white animate-spin" />
                            Submitting…
                          </>
                        ) : "Submit suggestion →"}
                      </button>

                    </>
                  )}
                </div>
              )}
            </div>

            {/* Not analyzed yet */}
            {!hasReport && (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700">Not analyzed yet</p>
                <p className="text-xs text-slate-600">
                  Your instructor will run the analysis for this project. Check back after they've reviewed your group.
                </p>
              </div>
            )}

            {/* Report available */}
            {hasReport && report && (
              <>
                {data.docsDataApproximate && <DocsDataApproximateNotice fixedAt={data.docsDataFixedAt} />}
                {data.rulesOutdated && (
                  <p role="note" className="text-xs text-slate-600">{RULES_OUTDATED_STUDENT_NOTICE}</p>
                )}
                {/* No contribution data for this student in the current report */}
                {report.myContribution === null && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-sm text-slate-500 leading-relaxed">
                    No contribution data was found for your account in this report. If you joined after the last analysis was run, your instructor may need to re-run it to include your contributions.
                  </div>
                )}

                {report.noActivity && (
                  <div role="status" className="rounded-xl border border-slate-300 bg-slate-100 p-5">
                    <NoActivityPill />
                    <p className="mt-2 text-sm leading-relaxed text-slate-800">
                      Nobody in your group has recorded activity yet, so there is nothing to compare. Shares and team health
                      appear after the group has commits or document edits and your instructor analyzes it again.
                    </p>
                    <LastAnalyzed className="mt-1" analyzedAt={report.analyzedAt} trigger={report.trigger} updating={updating} />
                  </div>
                )}

                {report.quietSource && !report.noActivity && (
                  <p role="note" className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-900">
                    {quietSourceText(report.quietSource)}
                  </p>
                )}

                {/* Members see their own overall share in one compact tile; the leader's is the "You" row below */}
                {report.myContribution && !report.noActivity && membership.role === "MEMBER" && (
                  <YourShareTile share={report.myContribution.contributionShare} memberCount={report.memberCount} onOpen={(el) => { memberOpener.current = el; setOpenMemberId(user?.id ?? null); }} />
                )}

                {/* Stats grid */}
                {report.myContribution && !report.noActivity && (() => {
                  const cards = getContributionStatsCards(report.myContribution, sourceType);
                  const blend = scoreBlendLine(report.myContribution, sourceType);
                  return (
                    <div className="space-y-2">
                      <div className={`grid grid-cols-2 gap-3 ${cards.length === 2 ? "" : "sm:grid-cols-4"}`}>
                        {cards.map(({ label, value }) => (
                          <div key={label} className="bg-white border border-slate-200 rounded-xl px-4 py-4 text-center">
                            <p className="text-xl font-semibold tabular-nums text-slate-800">{value}</p>
                            <p className="text-xs text-slate-600 mt-0.5">{label}</p>
                          </div>
                        ))}
                      </div>
                      {blend && (
                        <p className="flex items-center gap-1 text-xs text-slate-700">
                          {blend}
                          <InfoTip label="About the score blend" helpHref={helpLink("combined")}>{TIPS.scoreBlend}</InfoTip>
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Leader-only: every member's share, so work can be rebalanced */}
                {report.team && (
                  <LeaderTeamCard
                    team={report.team}
                    currentUserId={user?.id}
                    sourceType={sourceType}
                    noActivity={report.noActivity}
                    onOpenMember={(id, el) => { memberOpener.current = el; setOpenMemberId(id); }}
                  />
                )}

                {/* Team overview: evenness, the leader's team-level AI text and instructions check, then when it was analyzed */}
                {!report.noActivity && (
                  <section aria-labelledby="team-overview-title" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                    <h3 id="team-overview-title" className="text-sm font-semibold text-slate-900">Team overview</h3>
                    <div>
                      <p className="mb-1.5 flex items-center gap-1 text-xs text-slate-700">
                        How evenly work is shared
                        <InfoTip label="About how evenly work is shared" helpHref={helpLink("flags")}>{TIPS.evenness}</InfoTip>
                      </p>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${HEALTH_BADGE[report.teamHealth] ?? ""}`}>
                        {studentHealthLabel(report.teamHealth)}
                      </span>
                      <p className="mt-1.5 text-sm leading-normal text-slate-900">{evennessLine(report.teamHealth)}</p>
                    </div>
                    {isLeader && report.narrative && (
                      <div>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1"><AiBadge variant="ai" /></p>
                        <div className="mt-1.5 text-sm leading-relaxed text-slate-800 [&_p]:mb-0 [&_p]:mt-2 [&_p:first-child]:mt-0">
                          <ReactMarkdown>{report.narrative}</ReactMarkdown>
                        </div>
                        <p className="mt-2 text-xs leading-normal text-slate-700">
                          May be wrong. Informational only; it does not assign grades or replace instructor judgment.
                          {report.narrativeOutdated ? " Results changed since this was written." : ""}
                        </p>
                      </div>
                    )}
                    {isLeader && ai.data?.enabled && ai.data.briefCheck && ai.data.refreshFailed?.brief && (
                      <RefreshFailedNote note={ai.data.refreshFailed.brief} />
                    )}
                    {isLeader && ai.data?.enabled && ai.data.briefCheck && (
                      <BriefCheckWithMarks
                        projectId={projectId}
                        check={ai.data.briefCheck}
                        repoUrl={ai.data.repoUrl}
                        sourceType={sourceType}
                        onViewInstructions={assignment.description || assignment.attachments.length > 0
                          ? (quote) => { setBriefHighlight(quote ?? null); setShowBrief(true); }
                          : undefined}
                      />
                    )}
                    <LastAnalyzed variant="student" analyzedAt={report.analyzedAt} trigger={report.trigger} updating={updating} />
                  </section>
                )}

                {/* Your flags */}
                {report.myContribution && !report.noActivity && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Your Flags</h3>
                    {report.myContribution.flags.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-600 text-center">
                        No flags on your contributions.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {report.myContribution.flags.map((flag) => (
                          <div key={flag} className="bg-white border border-yellow-200 rounded-xl p-5">
                            <div className="flex items-start gap-3">
                              <div className="shrink-0 w-7 h-7 rounded-full bg-yellow-100 flex items-center justify-center mt-0.5">
                                <svg className="w-3.5 h-3.5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <FlagTag flag={flag} view="own" />
                                  {flag === "deadline-driven" && (
                                    <InfoTip label="About the last third" helpHref={helpLink("flags")}>
                                      {report.deadlineWindowBasis === "assignment-deadline" ? TIPS.flagBasisDeadline : TIPS.flagBasisSpan}
                                    </InfoTip>
                                  )}
                                  {(() => {
                                    const outcome = getFlagDisputeOutcome(flag, dispute);
                                    if (!outcome) return null;
                                    if (outcome === "RESOLVED") {
                                      return (
                                        <span className="text-xs font-bold px-1.5 py-0.5 rounded border text-emerald-700 bg-emerald-50 border-emerald-200">
                                          Reviewed — Accepted
                                        </span>
                                      );
                                    }
                                    return (
                                      <span className="text-xs font-bold px-1.5 py-0.5 rounded border text-slate-500 bg-slate-50 border-slate-200">
                                        Reviewed — Upheld
                                      </span>
                                    );
                                  })()}
                                </div>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                  {FLAG_DESCRIPTIONS[flag] ?? "A flag has been raised on your contribution pattern."}
                                </p>
                                <p className="text-xs text-slate-600 mt-1.5">
                                  Your instructor can see this. You can add a note to explain.
                                </p>
                                <div className="mt-4">
                                  {/* Existing dispute status */}
                                  {dispute && (
                                    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold uppercase tracking-wide">Note status:</span>
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${DISPUTE_STATUS_STYLE[dispute.status]}`}>
                                          {NOTE_STATUS[dispute.status].label}
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{dispute.reason}</p>
                                      {dispute.instructorResponse && (
                                        <div className="pt-1.5 border-t border-slate-200">
                                          <p className="text-xs font-semibold text-slate-500 mb-0.5">Instructor reply:</p>
                                          <p className="text-xs text-slate-700 leading-relaxed">{dispute.instructorResponse}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Submit button — only if no OPEN dispute exists */}
                                  {dispute?.status === "OPEN" ? (
                                    <p className="text-xs text-amber-600">
                                      Your note is open and awaiting instructor review.
                                    </p>
                                  ) : (
                                    <button
                                      onClick={() => setShowDisputeModal(true)}
                                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                                      </svg>
                                      {dispute ? "Add another note" : "Add a note"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {myNotes.length > 0 && (
                  <section aria-labelledby="your-notes-heading" className="mt-6">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h2 id="your-notes-heading" className="text-xs font-semibold uppercase tracking-widest text-slate-700">Your notes ({myNotes.length})</h2>
                      <button type="button" onClick={() => navigate("/disputes")} className="ft-hit rounded px-2 text-xs font-medium text-indigo-700 underline">See all your notes</button>
                    </div>
                    <div className="space-y-3">
                      {myNotes.map((n) => <StudentNoteCard key={n.id} note={n} />)}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* ── FairTraze Docs tab ────────────────────────────────────────────────── */}
        {effectiveTab === "document" && (
          <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">FairTraze Docs</h2>
              <span className="text-xs text-slate-600 hidden sm:inline">
                {viewingHistory ? "Past versions of this document, captured at each analysis run" : "Collaborative editor — shared document for this group"}
              </span>
              <button
                type="button"
                onClick={() => setViewingHistory((v) => !v)}
                title={viewingHistory ? undefined : HISTORY_HINT}
                className={`${BUTTON_SECONDARY_COMPACT} ml-auto`}
              >
                {viewingHistory ? "Back to live document" : "History"}
              </button>
            </div>
            {viewingHistory ? (
              <DocumentHistoryPanel groupId={projectId} />
            ) : (
              <>
                {docFocus.focus?.missing && (
                  <LinkedHeadingNotice projectId={projectId} focus={docFocus.focus} onRelink={docFocus.onRelink} onDismiss={docFocus.clear} />
                )}
                <DocumentGate
                  groupId={projectId}
                  editable={true}
                  canChooseTemplate={membership.role === "LEADER"}
                  title={project.groupName}
                  scrollToHeading={docFocus.focus?.heading ?? docSection.heading}
                  onHeadingResolved={docFocus.focus ? docFocus.onResolved : docSection.onResolved}
                />
              </>
            )}
          </div>
        )}

      </main>

      <AppFooter />
    </div>
    </DocSectionProvider>
  );
}
