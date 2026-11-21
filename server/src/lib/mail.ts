// Sends one email through the Brevo HTTPS API using the built-in fetch (no package).
// Nothing here ever logs a recipient, a link, a token or the API key: only fixed strings.

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 10_000;

export interface MailMessage {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html: string;
}

/** Read live so tests and a Render env change need no restart of module state. */
export function isMailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim() && process.env.MAIL_FROM?.trim());
}

/**
 * Sends the message. Never throws for a missing key or sender: it logs "mail not configured"
 * and returns false. A Brevo or network failure throws a generic Error (no response body, no
 * address) so callers can catch it and log their own fixed string.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!apiKey || !from) {
    console.warn("[mail] mail not configured");
    return false;
  }

  const fromName = process.env.MAIL_FROM_NAME?.trim() || "FAIR TRAZE AI";
  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: from, name: fromName },
      to: [message.toName ? { email: message.to, name: message.toName } : { email: message.to }],
      subject: message.subject,
      textContent: message.text,
      htmlContent: message.html,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`mail provider answered ${res.status}`);
  }
  return true;
}
