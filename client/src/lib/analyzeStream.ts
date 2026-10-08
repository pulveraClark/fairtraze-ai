import type { AnalyzeResponse } from "@shared/types";

// Real collection progress emitted by POST /api/projects/:id/analyze when the client asks for
// text/event-stream (server/src/routes/analyze.ts). Counts only — the server never sends scores,
// flags, Gini or team health before the terminal `done` event, and this module never reads them.
export interface GithubProgress { contributors: number; commits: number; files: number }
export interface DocsProgress { sessions: number; characters: number }

export type AnalyzeStage = "collecting" | "compute" | "save" | "done";

export interface AnalyzeProgress {
  stage: AnalyzeStage;
  github?: GithubProgress;
  docs?: DocsProgress;
}

export const INITIAL_PROGRESS: AnalyzeProgress = { stage: "collecting" };

export type AnalyzeStreamEvent =
  | { event: "github"; data: GithubProgress }
  | { event: "docs"; data: DocsProgress }
  | { event: "compute" | "save"; data: Record<string, never> };

/** A failure the server reported (as an `error` event or a plain JSON error body). */
export class AnalyzeError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AnalyzeError";
  }
}

interface RawFrame { event: string; data: string }

/**
 * Splits buffered SSE text into complete frames. Returns the unconsumed tail so a frame split
 * across network chunks is completed on the next read. Comment lines (": keep-alive") are dropped.
 */
export function parseSseFrames(buffer: string): { frames: RawFrame[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  const frames: RawFrame[] = [];
  for (const part of parts) {
    let event = "message";
    const data: string[] = [];
    for (const line of part.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (data.length > 0) frames.push({ event, data: data.join("\n") });
  }
  return { frames, rest };
}

/** Folds one stage event into the progress state; later stages imply earlier ones are finished. */
export function applyStreamEvent(prev: AnalyzeProgress, ev: AnalyzeStreamEvent): AnalyzeProgress {
  switch (ev.event) {
    case "github": return { ...prev, github: ev.data };
    case "docs":   return { ...prev, docs: ev.data };
    case "compute": return { ...prev, stage: "compute" };
    case "save":    return { ...prev, stage: "save" };
  }
}

/**
 * Runs the analysis, reporting stage events as they arrive, and resolves with the final
 * AnalyzeResponse. Uses fetch (not EventSource) because the request needs an Authorization header.
 * Responses that are not an event stream (validation/ownership errors) are plain JSON.
 */
export async function streamAnalyze(
  projectId: number,
  token: string | null,
  onEvent: (ev: AnalyzeStreamEvent) => void,
  signal?: AbortSignal
): Promise<AnalyzeResponse> {
  const res = await fetch(`/api/projects/${projectId}/analyze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
    signal,
  });

  if (!(res.headers.get("content-type") ?? "").includes("text/event-stream") || !res.body) {
    const body = (await res.json().catch(() => ({}))) as Partial<AnalyzeResponse> & { error?: string };
    if (!res.ok) throw new AnalyzeError(body.error ?? `Server error ${res.status}`, res.status);
    return body as AnalyzeResponse;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const { frames, rest } = parseSseFrames(done ? buffer + "\n\n" : buffer);
    buffer = rest;
    for (const frame of frames) {
      const data = JSON.parse(frame.data) as unknown;
      if (frame.event === "done") return data as AnalyzeResponse;
      if (frame.event === "error") {
        const err = data as { status?: number; error?: string };
        throw new AnalyzeError(err.error ?? "Analysis failed.", err.status);
      }
      if (frame.event === "github" || frame.event === "docs" || frame.event === "compute" || frame.event === "save") {
        onEvent({ event: frame.event, data } as AnalyzeStreamEvent);
      }
    }
    if (done) break;
  }
  throw new AnalyzeError("The connection closed before the analysis finished.");
}
