import type { StoredReportResponse } from "@shared/types";
import { CARD } from "../ui";

interface Props {
  stored: StoredReportResponse;
  sourceLabel: string;
  stale: boolean;
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-xs leading-normal text-slate-800">
      {label} <strong className="text-slate-900">{value}</strong>
    </span>
  );
}

/** Compact "report details" card: source, analysis date, repository, members, and the config used. */
export function ReportDetailsCard({ stored, sourceLabel, stale }: Props) {
  const cfg = stored.scoringConfig;
  const showRepo = stored.sourceType !== "EDITOR" && !!stored.repoUrl;
  return (
    <section aria-labelledby="report-details-title" className={`${CARD} min-w-0 p-5`}>
      <h2 id="report-details-title" className="text-base font-semibold text-slate-900">Report details</h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm leading-normal sm:grid-cols-2">
        <div><dt className="text-[0.8125rem] text-slate-700">Source</dt><dd className="font-semibold text-slate-900">{sourceLabel}</dd></div>
        <div><dt className="text-[0.8125rem] text-slate-700">Analyzed</dt><dd className="font-semibold text-slate-900">{new Date(stored.analyzedAt).toLocaleString()}</dd></div>
        {showRepo && (
          <div className="min-w-0">
            <dt className="text-[0.8125rem] text-slate-700">Repository</dt>
            <dd>
              <a
                href={stored.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-semibold text-indigo-800 underline underline-offset-2 hover:text-indigo-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                {stored.repoUrl.replace("https://github.com/", "")}
              </a>
            </dd>
          </div>
        )}
        <div><dt className="text-[0.8125rem] text-slate-700">Members</dt><dd className="font-semibold text-slate-900">{stored.report.memberCount}</dd></div>
      </dl>

      {cfg && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="mb-2 text-[0.8125rem] font-medium text-slate-700">Scored with</p>
          <div className="flex flex-wrap gap-1.5">
            <Pill label="commits" value={String(cfg.weights.commits)} />
            <Pill label="lines" value={String(cfg.weights.lines)} />
            <Pill label="days" value={String(cfg.weights.activeDays)} />
            <Pill label="free-rider" value={`${cfg.thresholds.freeRider}×`} />
            <Pill label="overload" value={`${cfg.thresholds.overload}×`} />
            <Pill label="deadline" value={`${+(cfg.thresholds.deadlineDriven * 100).toFixed(1)}%`} />
            {cfg.blend && stored.sourceType === "COMBINED" && (
              <>
                <Pill label="GitHub blend" value={`${Math.round(cfg.blend.wGitHub * 100)}%`} />
                <Pill label="Docs blend" value={`${Math.round(cfg.blend.wDocs * 100)}%`} />
              </>
            )}
          </div>
          {stale && <p className="mt-2 text-[0.8125rem] font-semibold text-amber-900">Settings changed — re-analyze to update.</p>}
        </div>
      )}
    </section>
  );
}
