import { useEffect, useState } from "react";
import { useRouter } from "../router";
import { useAuth } from "../context/AuthContext";
import logoUrl from "../assets/logo_transparent.png";

type Status = "verifying" | "succeeded" | "error";

export function VerifyEmailPage() {
  const { navigate } = useRouter();
  const { user, refreshUser } = useAuth();
  const token = new URLSearchParams(window.location.search).get("token");

  const [status, setStatus] = useState<Status>(token ? "verifying" : "error");
  const [error,  setError]  = useState<string | null>(
    token ? null : "This verification link is missing a token."
  );

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ token }),
        });
        const data = (await res.json()) as { message?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? `Verification failed (${res.status})`);
        if (cancelled) return;

        setStatus("succeeded");
        // Picks up emailVerified: true immediately if a session is already
        // active — no need to wait for the access token to refresh.
        if (user) void refreshUser();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Verification failed. Please try again.");
        setStatus("error");
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const heading = (
    <div className="text-center mb-8">
      <img src={logoUrl} alt="FAIR TRAZE AI" className="h-10 w-auto mx-auto mb-6" />
      <h1 className="font-display font-bold text-slate-900 text-2xl mb-1">Verify your email</h1>
    </div>
  );

  if (status === "verifying") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-sm text-center">
          {heading}
          <span className="inline-block h-5 w-5 rounded-full border-2 border-indigo-400/40 border-t-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (status === "succeeded") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-sm text-center">
          {heading}
          <div className="flex items-start gap-2.5 rounded-lg bg-indigo-50 border border-indigo-200 px-3.5 py-3 text-left mb-5">
            <svg className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-indigo-700 leading-relaxed">
              Your email has been verified.
            </p>
          </div>
          <button
            onClick={() => navigate(user ? (user.systemRole === "STUDENT" ? "/student" : user.systemRole === "ADMIN" ? "/admin" : "/dashboard") : "/login")}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm shadow-indigo-600/20 transition-all active:scale-[0.99]"
          >
            {user ? "Continue" : "Go to login"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm text-center">
        {heading}
        <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3.5 py-3 text-left mb-5">
          <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-red-700 leading-relaxed">{error}</p>
        </div>
        <button
          onClick={() => navigate(user ? (user.systemRole === "STUDENT" ? "/student" : user.systemRole === "ADMIN" ? "/admin" : "/dashboard") : "/login")}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm shadow-indigo-600/20 transition-all active:scale-[0.99]"
        >
          {user ? "Back to dashboard" : "Go to login"}
        </button>
        {user && !user.emailVerified && (
          <p className="text-center text-xs text-slate-500 mt-4">
            You can request a new link from the banner on your dashboard.
          </p>
        )}
      </div>
    </div>
  );
}
