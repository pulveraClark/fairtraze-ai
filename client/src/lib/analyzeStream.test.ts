import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseSseFrames,
  applyStreamEvent,
  streamAnalyze,
  AnalyzeError,
  INITIAL_PROGRESS,
  type AnalyzeStreamEvent,
} from "./analyzeStream";

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("parseSseFrames", () => {
  it("returns complete frames and keeps the unfinished tail", () => {
    const { frames, rest } = parseSseFrames('event: github\ndata: {"commits":1}\n\nevent: docs\ndata: {"se');
    expect(frames).toEqual([{ event: "github", data: '{"commits":1}' }]);
    expect(rest).toBe('event: docs\ndata: {"se');
  });

  it("drops keep-alive comments and handles CRLF", () => {
    const { frames } = parseSseFrames(": keep-alive\r\n\r\nevent: save\r\ndata: {}\r\n\r\n");
    expect(frames).toEqual([{ event: "save", data: "{}" }]);
  });
});

describe("applyStreamEvent", () => {
  it("folds counts and stage transitions into progress", () => {
    let p = applyStreamEvent(INITIAL_PROGRESS, { event: "github", data: { contributors: 2, commits: 9, files: 14 } });
    p = applyStreamEvent(p, { event: "docs", data: { sessions: 3, characters: 1200 } });
    expect(p).toEqual({ stage: "collecting", github: { contributors: 2, commits: 9, files: 14 }, docs: { sessions: 3, characters: 1200 } });
    expect(applyStreamEvent(p, { event: "compute", data: {} }).stage).toBe("compute");
    expect(applyStreamEvent(p, { event: "save", data: {} }).stage).toBe("save");
  });
});

describe("streamAnalyze", () => {
  it("forwards stage events split across chunks and resolves with the done payload", async () => {
    const response = { projectId: 1, report: { members: [] } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      sseResponse([
        'event: github\ndata: {"contributors":1,"commits":4,',
        '"files":6}\n\n: keep-alive\n\nevent: compute\ndata: {}\n\n',
        `event: done\ndata: ${JSON.stringify(response)}\n\n`,
      ])
    ));
    const seen: AnalyzeStreamEvent[] = [];

    const result = await streamAnalyze(1, "tok", (ev) => seen.push(ev));

    expect(result).toEqual(response);
    expect(seen).toEqual([
      { event: "github", data: { contributors: 1, commits: 4, files: 6 } },
      { event: "compute", data: {} },
    ]);
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Accept).toBe("text/event-stream");
  });

  it("throws the server's message for an error event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      sseResponse(['event: error\ndata: {"status":429,"error":"GitHub rate limit exceeded"}\n\n'])
    ));
    await expect(streamAnalyze(1, "tok", () => {})).rejects.toMatchObject({
      name: "AnalyzeError",
      message: "GitHub rate limit exceeded",
      status: 429,
    });
  });

  it("reads a plain JSON error body (validation errors never open the stream)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Project 9 not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    ));
    const err = await streamAnalyze(9, "tok", () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(AnalyzeError);
    expect(err.message).toBe("Project 9 not found");
  });

  it("fails clearly if the stream ends before a done event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(['event: save\ndata: {}\n\n'])));
    await expect(streamAnalyze(1, "tok", () => {})).rejects.toThrow(/closed before the analysis finished/);
  });
});
