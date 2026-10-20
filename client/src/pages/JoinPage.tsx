import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { roleHome } from "../lib/roleHome";
import { BUTTON_PRIMARY } from "../components/ui/styles";

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <span className="h-5 w-5 rounded-full border-2 border-indigo-400/40 border-t-indigo-500 animate-spin" />
    </div>
  );
}

export function NoCodeView({ onSubmit, onHome, homeLabel }: { onSubmit: (code: string) => void; onHome: () => void; homeLabel: string }) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">Join a class</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            A join code is a short code your instructor gives you, on a slide or as a QR code, to put you in their class.
            Paste it below. This link did not include one.
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); if (trimmed) onSubmit(trimmed); }}
          >
            <div>
              <label htmlFor="join-code" className="block text-xs font-semibold text-slate-700 mb-1.5">Join code</label>
              <input
                id="join-code"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                className="w-full min-h-9 rounded-lg border border-slate-300 px-3 text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
            </div>
            <button type="submit" disabled={!trimmed} className={`${BUTTON_PRIMARY} w-full`}>Join class</button>
          </form>
          <button type="button" onClick={onHome} className="ft-hit rounded px-2 text-sm text-indigo-700 hover:text-indigo-800 font-medium">
            ← {homeLabel}
          </button>
        </div>
      </div>
    </main>
  );
}

export function JoinPage() {
  const { user, token, loading: authLoading } = useAuth();
  const { navigate } = useRouter();

  const code = new URLSearchParams(window.location.search).get("code") ?? "";

  const [enrolling, setEnrolling] = useState(false);
  const [done,      setDone]      = useState(false);
  const [enrolled,  setEnrolled]  = useState<{ subjectCode: string; subjectName: string } | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const enrollAttempted = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      // Without a code there is nothing to come back to; the page explains and asks for one.
      if (!code) return;
      // Not logged in — save join URL so LoginPage/RegisterPage can return here after auth
      localStorage.setItem("ft_next", `/join?code=${encodeURIComponent(code)}`);
      setRedirecting(true);
      navigate("/login");
      return;
    }

    if (user.systemRole !== "STUDENT") return; // handled in render
    if (!code || enrollAttempted.current) return;

    enrollAttempted.current = true;
    setEnrolling(true);

    let cancelled = false;
    fetch("/api/join/class", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ joinCode: code.trim() }),
    })
      .then(async (res) => {
        if (cancelled) return;
        const data = await res.json() as { error?: string; subjectCode?: string; subjectName?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not enroll. The code may be invalid or already used.");
        } else {
          setEnrolled({ subjectCode: data.subjectCode!, subjectName: data.subjectName! });
          setDone(true);
        }
      })
      .catch(() => { if (!cancelled) setError("Network error — is the server running?"); })
      .finally(() => { if (!cancelled) setEnrolling(false); });

    return () => { cancelled = true; };
  }, [authLoading, user, code, token, navigate]);

  // Loading / about to redirect
  if (authLoading || redirecting) return <Spinner />;

  // No code in URL: explain what a join code is and let the person paste one.
  if (!code) {
    return (
      <NoCodeView
        onSubmit={(c) => navigate(`/join?code=${encodeURIComponent(c)}`)}
        onHome={() => navigate(user ? roleHome(user.systemRole).route : "/")}
        homeLabel={user ? "Back to your dashboard" : "Back to home"}
      />
    );
  }

  // Instructor / Admin — informational message only
  if (user && (user.systemRole === "INSTRUCTOR" || user.systemRole === "ADMIN")) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">This is a student join link</p>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Code <span className="font-mono font-bold text-indigo-600">{code}</span> lets students enroll in your class.
                You're signed in as {user.systemRole === "INSTRUCTOR" ? "an instructor" : "an admin"} — share this QR with your students.
              </p>
            </div>
            <button
              onClick={() => navigate(user.systemRole === "ADMIN" ? "/admin" : "/dashboard")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Student — enrolling / success / error
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-slate-100">
            <h1 className="text-xl font-semibold text-slate-900">Joining a Class</h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Code: <span className="font-mono font-bold text-indigo-600">{code}</span>
            </p>
          </div>

          <div className="px-6 py-6">
            {enrolling && (
              <div className="text-center space-y-3 py-4">
                <span className="h-8 w-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin inline-block" />
                <p className="text-sm text-slate-600">Enrolling you in this class…</p>
              </div>
            )}

            {done && enrolled && (
              <div className="text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">You're enrolled!</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {enrolled.subjectCode} — {enrolled.subjectName}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">Open the class to create or join a group.</p>
                </div>
                <button
                  onClick={() => navigate("/student")}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
                >
                  Go to My Classes
                </button>
              </div>
            )}

            {error && !enrolling && (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
                <button
                  onClick={() => navigate("/student")}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
                >
                  Go to My Classes
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
