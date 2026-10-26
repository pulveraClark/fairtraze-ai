import { useCallback, useState } from "react";
import type { NarrativeResponse } from "@shared/types";
import { useAuth } from "../context/AuthContext";
import type { UseAiReview } from "./useAiReview";

export interface AiReportGenerator {
  /** True when the one button also writes the work summaries (AI review on, instructor, report exists). */
  reviewOn: boolean;
  generating: boolean;
  error: string | null;
  generate: (regenerate?: boolean) => Promise<void>;
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
  const reviewOn = !!review?.data?.enabled && !!review.data.canGenerate && !!review.data.hasReport;

  const generate = useCallback(async (regenerate = false) => {
    setGenerating(true);
    setError(null);
    // The review runs in the background; it never delays or blocks the explanation.
    if (reviewOn) void review!.start();
    try {
      const url = `/api/projects/${projectId}/narrative${regenerate ? "?regenerate=true" : ""}`;
      const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = (await res.json()) as Partial<NarrativeResponse> & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not generate explanation.");
      } else if (data.narrative) {
        onNarrativeGenerated(data.narrative);
      }
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setGenerating(false);
    }
  }, [projectId, token, reviewOn, review, onNarrativeGenerated]);

  return { reviewOn, generating, error, generate };
}
