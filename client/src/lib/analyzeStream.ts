import type { AnalyzeResponse } from "@shared/types";

// Real collection progress emitted by POST /api/projects/:id/analyze when the client asks for
// text/event-stream (server/src/routes/analyze.ts). Raw counts, display names and per-day counts
// only — the server never sends scores, flags, Gini or team health before the terminal `done`
// event, and this module never reads them.
export interface DayCount { d: string; n: number }       // d = YYYY-MM-DD (Asia/Manila day)
export interface GithubMember { name: string; commits: number }
export interface DocsMember { name: string; sessions: number; characters: number }

export interface GithubTotals { contributors: number; commits: number; files: number }
export interface DocsTotals { sessions: number; characters: number }
export interface GithubProgress extends GithubTotals { member?: GithubMember; days?: DayCount[] }
export interface DocsProgress extends DocsTotals { member?: DocsMember; days?: DayCount[] }

export type AnalyzeStage = "collecting" | "compute" | "save" | "done";

// performance.now() readings taken when each stage's events arrived (client-measured).
export interface StageTimes {
  startedAt?: number;
  githubAt?: number;   // latest github event
  docsAt?: number;     // latest docs event
  computeAt?: number;
  saveAt?: number;
  doneAt?: number;
}

export interface AnalyzeProgress {
  stage: AnalyzeStage;
  github?: GithubTotals;
  docs?: DocsTotals;
  githubMembers: GithubMember[];
  docsMembers: DocsMember[];
  githubDays: Record<string, number>;
  docsDays: Record<string, number>;
  times: StageTimes;
}

export const INITIAL_PROGRESS: AnalyzeProgress = {
  stage: "collecting",
  githubMembers: [],
  docsMembers: [],
  githubDays: {},
  docsDays: {},
  times: {},
};

export type AnalyzeStreamEvent =
  | { event: "github"; data: GithubProgress }
  | { event: "docs"; data: DocsProgress }
  | { event: "compute" | "save"; data: Record<string, never> };

/** A fresh progress state for an analysis that starts now. */
export function startProgress(now: number = performance.now()): AnalyzeProgress {
  return { ...INITIAL_PROGRESS, times: { startedAt: now } };
}

/** Records when the terminal `done` event arrived. */
export function markDone(prev: AnalyzeProgress, now: number = performance.now()): AnalyzeProgress {
  return { ...prev, stage: "done", times: { ...prev.times, doneAt: now } };
}

export interface StageDurations {
  github?: number;   // seconds
  docs?: number;
  compute?: number;
  save?: number;
  total?: number;
}

const secondsBetween = (from?: number, to?: number) =>
  from === undefined || to === undefined ? undefined : Math.max(0, (to - from) / 1000);

/** Per-stage seconds from the measured timestamps. GitHub and Docs run concurrently, so each is measured from the start. */
export function stageDurations(t: StageTimes): StageDurations {
  return {
    github:  secondsBetween(t.startedAt, t.githubAt),
    docs:    secondsBetween(t.startedAt, t.docsAt),
    compute: secondsBetween(t.computeAt, t.saveAt),
    save:    secondsBetween(t.saveAt, t.doneAt),
    total:   secondsBetween(t.startedAt, t.doneAt),
  };
}

export function formatSeconds(seconds: number): string {
  return seconds < 0.05 ? "<0.1s" : `${seconds.toFixed(1)}s`;
}

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

function addDays(into: Record<string, number>, days: DayCount[] | undefined): Record<string, number> {
  if (!days || days.length === 0) return into;
  const next = { ...into };
  for (const { d, n } of days) next[d] = (next[d] ?? 0) + n;
  return next;
}

// A member keeps one row; a later event for the same name replaces it in place.
function upsertMember<T extends { name: string }>(rows: T[], row: T | undefined): T[] {
  if (!row) return rows;
  const i = rows.findIndex((r) => r.name === row.name);
  if (i === -1) return [...rows, row];
  const next = rows.slice();
  next[i] = row;
  return next;
}

/** Folds one stage event into the progress state; later stages imply earlier ones are finished. */
export function applyStreamEvent(prev: AnalyzeProgress, ev: AnalyzeStreamEvent, now: number = performance.now()): AnalyzeProgress {
  switch (ev.event) {
    case "github": {
      const { contributors, commits, files, member, days } = ev.data;
      return {
        ...prev,
        github: { contributors, commits, files },
        githubMembers: upsertMember(prev.githubMembers, member),
        githubDays: addDays(prev.githubDays, days),
        times: { ...prev.times, githubAt: now },
      };
    }
    case "docs": {
      const { sessions, characters, member, days } = ev.data;
      return {
        ...prev,
        docs: { sessions, characters },
        docsMembers: upsertMember(prev.docsMembers, member),
        docsDays: addDays(prev.docsDays, days),
        times: { ...prev.times, docsAt: now },
      };
    }
    case "compute": return { ...prev, stage: "compute", times: { ...prev.times, computeAt: now } };
    case "save":    return { ...prev, stage: "save", times: { ...prev.times, saveAt: now } };
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
