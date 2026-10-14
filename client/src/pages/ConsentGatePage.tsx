import { useState } from "react";
import { PRIVACY_NOTICE_VERSION } from "@shared/privacyNotice";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD } from "../components/ui";

/**
 * Blocking screen shown to a signed-in user who has not accepted the current Privacy Notice
 * version (every existing account once, and everyone again whenever the version is bumped).
 */
export function ConsentGatePage() {
  const { user, token, refreshUser, logout } = useAuth();
  const { navigate } = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returning = !!user?.consentVersion;

  async function accept() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/privacy/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ version: PRIVACY_NOTICE_VERSION }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Could not save your consent (${res.status})`);
      }
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your consent. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8" style={{ background: "var(--brand-bg-light)" }}>
      <div className={`${CARD} w-full max-w-lg p-6`}>
        <h1 className="text-xl font-semibold leading-tight text-slate-900">
          {returning ? "Our Privacy Notice has been updated" : "Please review our Privacy Notice"}
        </h1>
        <p className="mt-3 text-sm leading-normal text-slate-800">
          To keep using FAIR TRAZE AI, please read and accept the Privacy Notice (version {PRIVACY_NOTICE_VERSION}). In short:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-normal text-slate-800">
          <li>We collect your account details and your GitHub and document-editing activity to help instructors assess group contributions fairly.</li>
          <li>Google Gemini writes the report explanation using pseudonyms, never your name, email or GitHub username.</li>
          <li>You can download your data or request deletion at any time in Settings.</li>
        </ul>
        <p className="mt-3 text-sm">
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Read the full Privacy Notice
          </a>
        </p>

        <label className="mt-4 flex min-h-10 items-start gap-2 text-sm text-slate-900">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          />
          <span>I have read and agree to the Privacy Notice.</span>
        </label>

        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void accept()} disabled={!agreed || saving} className={BUTTON_PRIMARY}>
            {saving ? "Saving…" : "I agree"}
          </button>
          <button type="button" onClick={() => { logout(); navigate("/login"); }} className={BUTTON_SECONDARY}>
            Sign out
          </button>
        </div>
        {user && <p className="mt-3 break-all text-sm text-slate-700">Signed in as {user.email}</p>}
      </div>
    </main>
  );
}
