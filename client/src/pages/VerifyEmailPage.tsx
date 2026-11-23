import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "../router";
import { useAuth } from "../context/AuthContext";
import logoUrl from "../assets/logo_transparent.png";

// checking: asking the server if the link is still good (read-only, uses nothing up).
// ready:    the link is good; the person presses one button to confirm.
// problem:  unknown, used or expired link (the server never says which).
type Status = "checking" | "ready" | "verifying" | "succeeded" | "problem" | "unreachable";

const LIMIT_TEXT = "Too many requests. Please wait a few minutes and try again.";
const SEND_FAILED_TEXT = "Could not send the email. Try again in a minute.";
const BUTTON = "w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold shadow-sm shadow-indigo-600/20 transition-all active:scale-[0.99]";

function Notice({ tone, children }: { tone: "info" | "error"; children: ReactNode }) {
  const c = tone === "info"
    ? { box: "bg-indigo-50 border-indigo-200", icon: "text-indigo-500", text: "text-indigo-700", path: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" }
    : { box: "bg-red-50 border-red-200",       icon: "text-red-500",    text: "text-red-700",    path: "M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-left mb-5 ${c.box}`}>
      <svg className={`w-4 h-4 shrink-0 mt-0.5 ${c.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={c.path} />
      </svg>
      <p className={`text-xs leading-relaxed ${c.text}`}>{children}</p>
    </div>
  );
}

export function VerifyEmailPage() {
  const { navigate } = useRouter();
  const { user, token: authToken, loading, refreshUser } = useAuth();
  const token = new URLSearchParams(window.location.search).get("token");

  const [status,  setStatus]  = useState<Status>(token ? "checking" : "problem");
  const [error,   setError]   = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const checkStartedRef = useRef(false);   // StrictMode runs effects twice in development; send one check.
  const busyRef         = useRef(false);   // A second click while the first request runs is ignored.

  async function runCheck() {
    if (!token) return;
    setStatus("checking");
    try {
      const res = await fetch(`/api/auth/verify-email/check?token=${encodeURIComponent(token)}`);
      const data = (await res.json()) as { valid?: boolean };
      if (!res.ok) throw new Error("check failed");
      setStatus(data.valid ? "ready" : "problem");
    } catch {
      setStatus("unreachable");
    }
  }

  useEffect(() => {
    if (!token || checkStartedRef.current) return;
    checkStartedRef.current = true;
    void runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleVerify() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setStatus("verifying");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token }),
      });
      if (res.status === 400) { setStatus("problem"); return; }
      if (res.status === 429) { setError(LIMIT_TEXT); setStatus("ready"); return; }
      if (!res.ok) { setError("We couldn't verify your email. Try again."); setStatus("ready"); return; }
      setStatus("succeeded");
      // Picks up emailVerified: true immediately if a session is already active.
      if (user) void refreshUser();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setStatus("ready");
    } finally {
      busyRef.current = false;
    }
  }

  async function handleSendNewLink() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method:  "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.status === 429) { setError(LIMIT_TEXT); return; }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? SEND_FAILED_TEXT);
        return;
      }
      setSent(true);
    } catch {
      setError(SEND_FAILED_TEXT);
    } finally {
      busyRef.current = false;
      setSending(false);
    }
  }

  const home = user ? (user.systemRole === "STUDENT" ? "/student" : user.systemRole === "ADMIN" ? "/admin" : "/dashboard") : "/login";

  const shell = (body: ReactNode) => (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="text-center mb-8">
          <img src={logoUrl} alt="FAIR TRAZE AI" className="h-10 w-auto mx-auto mb-6" />
          <h1 className="font-display font-semibold text-slate-900 text-xl mb-1">Verify your email</h1>
        </div>
        {body}
      </div>
    </div>
  );

  if (status === "checking" || status === "verifying" || loading) {
    return shell(
      <div role="status" aria-live="polite">
        <span className="inline-block h-5 w-5 rounded-full border-2 border-indigo-400/40 border-t-indigo-500 animate-spin" aria-hidden="true" />
        <p className="text-xs text-slate-500 mt-3">{status === "verifying" ? "Verifying…" : "Checking link…"}</p>
      </div>,
    );
  }

  if (status === "ready") {
    return shell(
      <>
        <p className="text-sm text-slate-600 mb-5">Press the button to finish verifying your email.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <button onClick={() => void handleVerify()} className={BUTTON}>Verify my email</button>
      </>,
    );
  }

  if (status === "succeeded") {
    return shell(
      <>
        <Notice tone="info">Your email has been verified.</Notice>
        <button onClick={() => navigate(home)} className={BUTTON}>{user ? "Continue" : "Go to login"}</button>
      </>,
    );
  }

  if (status === "unreachable") {
    return shell(
      <>
        <Notice tone="error">We couldn't check the link. Check your connection and try again.</Notice>
        <button onClick={() => void runCheck()} className={BUTTON}>Try again</button>
      </>,
    );
  }

  // problem: the link is unknown, used or expired (or missing).
  if (user?.emailVerified === true) {
    return shell(
      <>
        <Notice tone="info">Your email is already verified.</Notice>
        <button onClick={() => navigate(home)} className={BUTTON}>Continue</button>
      </>,
    );
  }

  if (user) {
    return shell(
      <>
        <Notice tone="error">This link expired or was already used.</Notice>
        {sent ? (
          <Notice tone="info">Sent. Check your inbox, and your spam folder too.</Notice>
        ) : (
          <>
            {error && <Notice tone="error">{error}</Notice>}
            <button onClick={() => void handleSendNewLink()} disabled={sending} className={BUTTON}>
              {sending ? "Sending…" : "Send a new link"}
            </button>
          </>
        )}
        <button onClick={() => navigate(home)} className="mt-3 text-xs font-semibold text-slate-600 hover:text-slate-900 underline">
          Back to dashboard
        </button>
      </>,
    );
  }

  return shell(
    <>
      <Notice tone="error">This link expired or was already used. Sign in to send a new one.</Notice>
      <button onClick={() => navigate("/login")} className={BUTTON}>Sign in</button>
    </>,
  );
}
