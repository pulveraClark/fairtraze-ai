// Student text is data, never instructions. Lines that try to talk to the AI reviewer are replaced
// before anything is sent, and counted so the instructor can be told neutrally. This is one layer;
// the prompt also fences all student text as data and the output is schema-checked.

export const INJECTION_PLACEHOLDER = "[text addressed to the AI removed]";

const PATTERNS: RegExp[] = [
  /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,30}\b(?:previous|prior|above|earlier|all|any|your)\b[^.\n]{0,30}\b(?:instructions?|prompts?|rules?|messages?|directions?)\b/i,
  /\bsystem\s+(?:prompt|instructions?|message)\b/i,
  /\byou\s+are\s+(?:now\s+)?(?:an?|the)\s+(?:ai|assistant|language\s+model|llm|gemini|reviewer|helpful|chatbot)\b/i,
  /\bas\s+an\s+ai\b/i,
  /\b(?:hey|hi|hello|dear|attention|note\s+to)\s+(?:gemini|ai|assistant|reviewer|llm|model|chatbot)\b/i,
  /\b(?:mark|rate|label|report|classify|set|treat)\b[^.\n]{0,50}\b(?:as|to)\s+(?:found|partly\s+found|not\s+found|satisfied|fulfilled|fully\s+met)\b/i,
  /\b(?:give|assign|award|grant)\b[^.\n]{0,30}\b(?:full|top|maximum|highest|perfect)\s+(?:marks?|scores?|grades?|credit)\b/i,
  /\bnew\s+instructions?\s*:/i,
  /\bdo\s+not\s+(?:mention|tell|reveal)\b[^.\n]{0,30}\b(?:instructor|teacher|reviewer)\b/i,
  /<\/?(?:system|assistant|user|instructions?)>/i,
  /\[\/?(?:INST|SYSTEM)\]/i,
  /^\s*(?:system|assistant)\s*:/i,
];

export function addressesTheAi(line: string): boolean {
  return PATTERNS.some((re) => re.test(line));
}

export interface InjectionScreenResult {
  text: string;
  // How many lines were replaced.
  count: number;
}

export function screenInjection(text: string): InjectionScreenResult {
  let count = 0;
  const lines = text.split("\n").map((line) => {
    if (!addressesTheAi(line)) return line;
    count++;
    return INJECTION_PLACEHOLDER;
  });
  return { text: lines.join("\n"), count };
}
