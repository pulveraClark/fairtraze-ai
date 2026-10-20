import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { roleHome } from "../lib/roleHome";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "../components/ui/styles";
import { useSubmitGuard } from "../hooks/useSubmitGuard";

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

interface JoinPreview { classId: number; className: string; alreadyEnrolled: boolean }

function Shell({ title, code, children }: { title: string; code: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-slate-100">
            <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Code: <span className="font-mono font-bold text-indigo-700">{code}</span>
            </p>
          </div>
          <div className="px-6 py-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function JoinPage() {
  const { user, token, loading: authLoading } = useAuth();
  const { navigate } = useRouter();

  const code = new URLSearchParams(window.location.search).get("code") ?? "";

  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [enrolled, setEnrolled] = useState<{ subjectCode: string; subjectName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const { submitting: enrolling, run } = useSubmitGuard();

  const isStudent = user?.systemRole === "STUDENT";

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

    if (!isStudent || !code) return; // instructors and admins get a message in render

    // Look the class up. This never enrolls: the student confirms below.
    let cancelled = false;
    setLoadingPreview(true);
    fetch(`/api/join/class/${encodeURIComponent(code.trim())}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (cancelled) return;
        const data = await res.json().catch(() => ({})) as Partial<JoinPreview> & { error?: string };
        if (!res.ok) { setError(data.error ?? "Could not check this code. Try again."); return; }
        if (data.alreadyEnrolled) { navigate(`/student/class/${data.classId}`); return; }
        setPreview(data as JoinPreview);
      })
      .catch(() => { if (!cancelled) setError("We couldn't reach the server. Check your connection and try again."); })
      .finally(() => { if (!cancelled) setLoadingPreview(false); });

    return () => { cancelled = true; };
  }, [authLoading, user, isStudent, code, token, navigate]);

  async function handleJoin() {
    await run(async () => {
      setError(null);
      try {
        const res = await fetch("/api/join/class", {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ joinCode: code.trim() }),
        });
        const data = await res.json().catch(() => ({})) as { error?: string; subjectCode?: string; subjectName?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not enroll. The code may be invalid or already used.");
        } else {
          setEnrolled({ subjectCode: data.subjectCode!, subjectName: data.subjectName! });
        }
      } catch {
        setError("We couldn't reach the server. Check your connection and try again.");
      }
    });
  }

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

  // Instructor / Admin — informational message only, never joins
  if (user && (user.systemRole === "INSTRUCTOR" || user.systemRole === "ADMIN")) {
    return (
      <Shell title="This is a student join link" code={code}>
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-800 leading-relaxed">
            This link lets students join a class. You're signed in as {user.systemRole === "INSTRUCTOR" ? "an instructor" : "an admin"}, so nothing was joined.
          </p>
          <button onClick={() => navigate(user.systemRole === "ADMIN" ? "/admin" : "/dashboard")} className={BUTTON_PRIMARY}>
            Go to dashboard
          </button>
        </div>
      </Shell>
    );
  }

  // Student
  return (
    <Shell title={enrolled ? "You're enrolled" : "Join a class"} code={code}>
      {loadingPreview && !error && (
        <div className="text-center space-y-3 py-4" role="status">
          <span className="h-8 w-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin inline-block" />
          <p className="text-sm text-slate-800">Checking the code…</p>
        </div>
      )}

      {preview && !enrolled && (
        <div className="space-y-4">
          <p className="text-sm text-slate-900">Join <span className="font-semibold">{preview.className}</span>?</p>
          {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleJoin()} disabled={enrolling} className={BUTTON_PRIMARY}>
              {enrolling ? "Joining…" : "Join"}
            </button>
            <button type="button" onClick={() => navigate("/student")} disabled={enrolling} className={BUTTON_SECONDARY}>Not now</button>
          </div>
        </div>
      )}

      {enrolled && (
        <div className="space-y-4 text-center">
          <p className="text-sm font-semibold text-slate-900">{enrolled.subjectCode} — {enrolled.subjectName}</p>
          <p className="text-sm text-slate-800">Open the class to create or join a group.</p>
          <button onClick={() => navigate("/student")} className={BUTTON_PRIMARY}>Go to my classes</button>
        </div>
      )}

      {error && !preview && !loadingPreview && (
        <div className="space-y-4">
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>
          <button onClick={() => navigate("/student")} className={BUTTON_PRIMARY}>Go to my classes</button>
        </div>
      )}
    </Shell>
  );
}
