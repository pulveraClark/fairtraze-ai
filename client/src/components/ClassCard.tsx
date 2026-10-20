import { groupsNeedAttention } from "../lib/attentionLabel";
import { useState } from "react";
import { classAccent } from "../lib/classBand";
import type { ProjectSummaryItem } from "@shared/types";
import { isAtRiskGroup, noActivityCount, presentedHealth } from "../lib/groupActivity";
import { NoActivityRollup } from "./NoActivityRollup";
import { OverflowMenu } from "./ui/OverflowMenu";
import { ClassCodeLabel } from "./ClassCodeLabel";

interface Props {
  classId: number;
  assignmentLabel: string;
  items: ProjectSummaryItem[];
  onClick: () => void;
  edpCode?: string;
  classType?: "LECTURE" | "LABORATORY";
  onDelete?: () => void;
  projectCount?: number;
  joinCode?: string;
}


export function parseClassLabel(label: string): { code: string; subjectName: string } {
  const sep = label.indexOf(" — ");
  if (sep === -1) return { code: label, subjectName: "" };
  return { code: label.slice(0, sep), subjectName: label.slice(sep + 3) };
}

export function classAtRiskCount(items: ProjectSummaryItem[]): number {
  return items.filter(isAtRiskGroup).length;
}

export function ClassCard({ classId, assignmentLabel, items, onClick, edpCode, classType, onDelete, projectCount, joinCode }: Props) {
  const { code, subjectName } = parseClassLabel(assignmentLabel);
  const [copied, setCopied] = useState(false);

  async function handleCopyJoinCode(e: React.MouseEvent) {
    e.stopPropagation();
    if (!joinCode) return;
    await navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const analyzed   = items.filter((i) => i.isAnalyzed);
  const healthy    = analyzed.filter((i) => presentedHealth(i) === "Healthy").length;
  const quiet      = noActivityCount(items);
  const moderate   = analyzed.filter((i) => presentedHealth(i) === "Moderate Risk").length;
  const highRisk   = analyzed.filter((i) => presentedHealth(i) === "High Risk").length;
  const unanalyzed = items.filter((i) => !i.isAnalyzed).length;
  const atRisk     = classAtRiskCount(items);

  

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className="group cursor-pointer w-full text-left bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md hover:border-slate-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      {/* Colored band */}
      <div
        className="relative px-4 py-3 flex flex-col gap-2"
        style={{ background: classAccent(classId).color }}
      >
        <div className="flex items-start justify-between gap-2">
          {/* Clipboard icon */}
          <div className="h-7 w-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>

          <div className="flex items-center gap-1.5">
            {atRisk > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/25 border border-white/30 text-white text-xs font-semibold whitespace-nowrap">
                ⚠ {groupsNeedAttention(atRisk)}
              </span>
            )}
            {onDelete && (
              <OverflowMenu
                label="Class options"
                variant="onColor"
                items={[{ label: "Delete class section…", tone: "danger", onSelect: onDelete }]}
              />
            )}
          </div>
        </div>

        {/* Subject code · EDP code */}
        <div>
          <p className="text-white font-mono font-bold text-base leading-tight tracking-tight">
            <ClassCodeLabel subjectCode={code} edpCode={edpCode} edpClassName="font-semibold text-white/75" />
          </p>
          {classType && (
            <p className="text-white/60 text-xs font-mono mt-0.5">
              {classType.charAt(0) + classType.slice(1).toLowerCase()}
            </p>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 py-3 flex flex-col gap-2">
        {/* Subject name + BSIT badge */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800 leading-snug group-hover:text-indigo-700 transition-colors">
            {subjectName || code}
          </p>
          <span className="shrink-0 text-xs font-bold text-slate-600 bg-slate-100 rounded px-1.5 py-0.5 tracking-wide uppercase">
            BSIT
          </span>
        </div>

        {/* Project count */}
        {projectCount !== undefined && (
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-700">{projectCount}</span>{" "}
            project{projectCount !== 1 ? "s" : ""}
          </p>
        )}

        {/* Join code */}
        {joinCode && (
          <div className="flex items-center flex-wrap gap-1.5">
            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span className="text-xs text-slate-600 shrink-0">Join code:</span>
            <span className="font-mono font-extrabold text-sm text-violet-700 tracking-wide select-all break-all">
              {joinCode}
            </span>
            <button
              onClick={handleCopyJoinCode}
              title={copied ? "Copied!" : "Copy join code"}
              className={`ft-hit rounded transition-colors ${copied ? "text-emerald-600" : "text-slate-500 hover:text-indigo-600"}`}
            >
              {copied ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        )}

        {/* Risk rollup */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {highRisk > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
              {highRisk} High Risk
            </span>
          )}
          {moderate > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
              {moderate} Moderate
            </span>
          )}
          {healthy > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
              {healthy} Healthy
            </span>
          )}
          {unanalyzed > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
              {unanalyzed} Not analyzed
            </span>
          )}
        </div>
        <NoActivityRollup count={quiet} />

        {/* Footer arrow */}
        <div className="flex justify-end">
          <span className="text-xs text-slate-600 group-hover:text-indigo-500 transition-colors">
            View groups →
          </span>
        </div>
      </div>
    </div>
  );
}
