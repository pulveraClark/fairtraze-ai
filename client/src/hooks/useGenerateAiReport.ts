import { useCallback, useEffect, useRef, useState } from "react";
import type { NarrativeResponse } from "@shared/types";
import { useAuth } from "../context/AuthContext";
import { AI_SLOW_MS, quotaResetLine, upToDateLine } from "../lib/aiReview";
import { NETWORK_ERROR_TEXT } from "../lib/failureText";
import type { UseAiReview } from "./useAiReview";
import { useSlowAfter } from "./useSlowAfter";

export interface AiReportGenerator {
  /** True when the one button also writes the work summaries (AI review on, instructor, report exists). */
  reviewOn: boolean;
  generating: boolean;
  error: string | null;
  /** A calm note when new AI findings could not be written but the saved ones are shown; null otherwise. */
  warning: string | null;
  generate: (regenerate?: boolean) => Promise<void>;
  /** "Already up to date. Nothing changed since …" after a Regenerate that changed nothing; null otherwise. */
  upToDate: string | null;
  /** Something is being written: the explanation request or the background member findings. */
  busy: boolean;
  /** Busy for more than 90 s: the wording changes and the button is usable again. */
  slow: boolean;
  /** What a screen reader hears. "updated" only after a run finished during this page visit. */
  announcement: "" | "writing" | "updated";
}

/**
 * The one "Generate AI explanation & review" action. The report card and the member details window
 * both call it, so they can never drift apart. Whether the viewer may generate is decided by the
 * server (`canGenerate`, the owning instructor); this hook only mirrors that flag.
 */
export function useGenerateAiReport(
  projectId: number,
  review: UseAiReview | undefined,
  onNarrativeGenerated: (text: string) => void,
): AiReportGenerator {
  const { token } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  // When the saved explanation was written, if the last click found it unchanged (the server made no AI call).
  const [narrativeSince, setNarrativeSince] = useState<string | null>(null);
  const reviewOn = !!review?.data?.enabled && !!review.data.canGenerate && !!review.data.hasReport;

  const generate = useCallback(async (regenerate = false) => {
    setGenerating(true);
    setError(null);
    setWarning(null);
    setNarrativeSince(null);
    // The review runs in the background; it never delays or blocks the explanation.
    if (reviewOn) void review!.start();
    try {
      const url = `/api/projects/${projectId}/narrative${regenerate ? "?regenerate=true" : ""}`;
      const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = (await res.json()) as Partial<NarrativeResponse> & { error?: string };
      if (!res.ok) {
        // The daily limit is worded here, on the viewer's clock; every other message comes from the server.
        setError(data.code === "AI_QUOTA_DAILY" ? quotaResetLine(data.retryAt) : (data.error ?? "Could not generate AI findings."));
      } else if (data.narrative) {
        onNarrativeGenerated(data.narrative);
        setNarrativeSince(data.upToDate?.since ?? null);
        // The saved text is shown, but a new one could not be written: say why and what to do (server wording;
        // the daily limit is worded on the viewer's clock).
        if (data.warning) setWarning(data.code === "AI_QUOTA_DAILY" ? quotaResetLine(data.retryAt) : data.warning);
      }
    } catch {
      setError(NETWORK_ERROR_TEXT);
    } finally {
      setGenerating(false);
    }
  }, [projectId, token, reviewOn, review, onNarrativeGenerated]);

  const busy = generating || !!review?.data?.running;
  const slow = useSlowAfter(busy, AI_SLOW_MS);
  const failed = !!(error ?? review?.error);

  // Running to done within this visit. First load with nothing running announces nothing.
  const [announcement, setAnnouncement] = useState<"" | "writing" | "updated">("");
  const wasBusy = useRef(false);
  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      setAnnouncement("writing");
    } else if (wasBusy.current) {
      wasBusy.current = false;
      setAnnouncement(failed ? "" : "updated");
    }
  }, [busy, failed]);

  const upToDate = busy || failed || warning ? null : upToDateLine(narrativeSince, reviewOn, review?.data?.upToDate?.since);

  return { reviewOn, generating, error, warning, generate, upToDate, busy, slow, announcement };
}
