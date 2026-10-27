import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { aiReviewLimiter, noteDailyQuotaHit, quotaGate, takeDailyBudget } from "./aiReview/limiter.js";
import { parseQuotaError, retryWaitMs } from "./aiQuota.js";

// JSON-only Gemini client for the AI review (member summaries, brief check). Separate from
// gemini.ts on purpose: the narrative path is untouched. Low randomness: temperature 0, fixed seed.
// The key is read lazily so importing this file never throws, and a missing key is a soft failure.

export type AiErrorCode =
  | "AI_DISABLED" | "AI_UNAVAILABLE" | "AI_RATE_LIMITED" | "AI_QUOTA_DAILY" | "AI_TIMEOUT" | "AI_BAD_OUTPUT" | "AI_BAD_INPUT";

export class AiReviewError extends Error {
  // retryAfterMs: what the provider said about when to try again (rate limit and daily quota only).
  constructor(public readonly code: AiErrorCode, message?: string, public readonly retryAfterMs: number | null = null) {
    super(message ?? code);
    this.name = "AiReviewError";
  }
}

// Global kill switch. Off by default; the demo turns it on explicitly.
export function aiReviewEnabled(): boolean {
  return process.env.AI_REVIEW_ENABLED === "true";
}

export const AI_REVIEW_SEED = 7;
export const AI_CALL_TIMEOUT_MS = 45_000;
// A request that carries files (PDF, images) takes longer.
export const AI_CALL_TIMEOUT_FILES_MS = 60_000;

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiReviewError("AI_UNAVAILABLE", "GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: key });
  return client;
}

export function modelName(): string {
  return process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
}

export interface JsonRequest<T> {
  system: string;
  prompt: string;
  // Gemini responseSchema (OpenAPI-style subset). Output is also checked by `validate`.
  schema: Record<string, unknown>;
  // Returns the typed value, or null when the shape is wrong.
  validate: (value: unknown) => T | null;
  timeoutMs?: number;
  // Files sent inline with the prompt (PDF, images). Held in memory for this call only: never logged,
  // stored or put in an error. When Gemini rejects the request as invalid (400), the error is AI_BAD_INPUT.
  files?: Array<{ mimeType: string; data: Buffer }>;
}

function stripFences(text: string): string {
  const t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]! : t;
}

async function callOnce(req: JsonRequest<unknown>): Promise<string> {
  const hasFiles = !!req.files?.length;
  const timeoutMs = req.timeoutMs ?? (hasFiles ? AI_CALL_TIMEOUT_FILES_MS : AI_CALL_TIMEOUT_MS);
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiReviewError("AI_TIMEOUT"));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      getClient().models.generateContent({
        model: modelName(),
        contents: hasFiles
          ? [{
              role: "user",
              parts: [
                ...req.files!.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.data.toString("base64") } })),
                { text: req.prompt },
              ],
            }]
          : req.prompt,
        config: {
          systemInstruction: req.system,
          temperature: 0,
          seed: AI_REVIEW_SEED,
          responseMimeType: "application/json",
          responseSchema: req.schema,
          abortSignal: controller.signal,
        },
      }),
      timeout,
    ]);
    return response.text ?? "";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Every provider call goes through here first (the review client and the narrative): refused up front when
// the provider said the daily limit is reached or the day's call count is used up, otherwise counted.
export function reserveProviderCall(): void {
  const gate = quotaGate(1);
  if (!gate.ok) throw new AiReviewError("AI_QUOTA_DAILY", undefined, gate.retryAfterMs);
  takeDailyBudget();
}

// A per-day quota gets its own code; the provider's own text is never kept.
function rateLimitError(err: unknown): AiReviewError {
  const q = parseQuotaError(err);
  if (q.daily) noteDailyQuotaHit(q.retryAfterMs);
  return new AiReviewError(q.daily ? "AI_QUOTA_DAILY" : "AI_RATE_LIMITED", undefined, q.retryAfterMs);
}

function classify(err: unknown, hasFiles = false): AiReviewError {
  if (err instanceof AiReviewError) return err;
  const status = (err as { status?: number } | null)?.status;
  if (status === 429) return rateLimitError(err);
  // With files attached, a 400 usually means one of them could not be read; the caller can retry without.
  if (status === 400 && hasFiles) return new AiReviewError("AI_BAD_INPUT");
  return new AiReviewError("AI_UNAVAILABLE");
}

// One paced, budgeted call. A per-minute 429 is retried once after the delay Gemini asks for (capped);
// a per-day quota is never retried. Everything is mapped to a small set of codes so no raw provider
// text reaches users.
export async function generateJson<T>(req: JsonRequest<T>): Promise<T> {
  if (!aiReviewEnabled()) throw new AiReviewError("AI_DISABLED");

  // Each attempt is a provider call and is counted, a retry included.
  const run = async (): Promise<string> => {
    reserveProviderCall();
    return aiReviewLimiter.schedule(() => callOnce(req));
  };

  let text: string;
  try {
    text = await run();
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    if (status !== 429) throw classify(err, !!req.files?.length);
    const quota = parseQuotaError(err);
    if (quota.daily) throw rateLimitError(err);
    await new Promise((r) => setTimeout(r, retryWaitMs(quota)));
    try {
      text = await run();
    } catch (err2) {
      throw classify(err2, !!req.files?.length);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    throw new AiReviewError("AI_BAD_OUTPUT", "response was not JSON");
  }
  const value = req.validate(parsed);
  if (value === null) throw new AiReviewError("AI_BAD_OUTPUT", "response did not match the expected shape");
  return value;
}
