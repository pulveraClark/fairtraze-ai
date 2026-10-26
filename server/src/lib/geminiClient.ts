import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { aiReviewLimiter, takeDailyBudget } from "./aiReview/limiter.js";

// JSON-only Gemini client for the AI review (member summaries, brief check). Separate from
// gemini.ts on purpose: the narrative path is untouched. Low randomness: temperature 0, fixed seed.
// The key is read lazily so importing this file never throws, and a missing key is a soft failure.

export type AiErrorCode = "AI_DISABLED" | "AI_UNAVAILABLE" | "AI_RATE_LIMITED" | "AI_TIMEOUT" | "AI_BAD_OUTPUT";

export class AiReviewError extends Error {
  constructor(public readonly code: AiErrorCode, message?: string) {
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
}

export function parseRetryDelayMs(err: unknown): number {
  const message = (err as { message?: string } | null)?.message ?? "";
  const match = message.match(/retry in (\d+(?:\.\d+)?)\s*s/i) ?? message.match(/(\d+)\s*s\b/i);
  const seconds = match ? Math.min(Number(match[1]), 30) : 5;
  return Math.max(1, Math.ceil(seconds)) * 1000;
}

function stripFences(text: string): string {
  const t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]! : t;
}

async function callOnce(req: JsonRequest<unknown>): Promise<string> {
  const timeoutMs = req.timeoutMs ?? AI_CALL_TIMEOUT_MS;
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
        contents: req.prompt,
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

function classify(err: unknown): AiReviewError {
  if (err instanceof AiReviewError) return err;
  const status = (err as { status?: number } | null)?.status;
  if (status === 429) return new AiReviewError("AI_RATE_LIMITED");
  return new AiReviewError("AI_UNAVAILABLE");
}

// One paced, budgeted call. A 429 is retried once after the delay Gemini asks for; everything else
// is mapped to a small set of codes so no raw provider text reaches users.
export async function generateJson<T>(req: JsonRequest<T>): Promise<T> {
  if (!aiReviewEnabled()) throw new AiReviewError("AI_DISABLED");
  if (!takeDailyBudget()) throw new AiReviewError("AI_RATE_LIMITED", "daily AI review call budget used");

  const run = async (): Promise<string> => aiReviewLimiter.schedule(() => callOnce(req));

  let text: string;
  try {
    text = await run();
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    if (status !== 429) throw classify(err);
    await new Promise((r) => setTimeout(r, parseRetryDelayMs(err)));
    try {
      text = await run();
    } catch (err2) {
      throw classify(err2);
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
