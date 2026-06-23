import { useState, useEffect, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { AppTopBar } from "../components/AppTopBar";

function roleHome(role?: string): string {
  if (role === "STUDENT") return "/student";
  if (role === "ADMIN")   return "/admin";
  return "/dashboard";
}

interface FullProfile {
  id: number;
  email: string;
  name: string;
  systemRole: string;
  githubUsername: string | null;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  INSTRUCTOR: "Instructor",
  ADMIN:      "Admin",
  STUDENT:    "Student",
};

const ROLE_BADGE: Record<string, string> = {
  INSTRUCTOR: "text-amber-400 border-amber-400/20 bg-amber-400/[0.06]",
  ADMIN:      "text-amber-400 border-amber-400/20 bg-amber-400/[0.06]",
  STUDENT:    "text-indigo-400 border-indigo-400/20 bg-indigo-400/[0.06]",
};

const inputClass =
  "w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20 transition-colors";

const readonlyClass =
  "w-full rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-500 cursor-not-allowed select-none";

function SuccessBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5">
      <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <p className="text-xs text-emerald-700 font-medium">{msg}</p>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5">
      <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-xs text-red-600">{msg}</p>
    </div>
  );
}

export function SettingsPage() {
  const { user, token, refreshUser } = useAuth();
  const { navigate } = useRouter();

  const [profile, setProfile]   = useState<FullProfile | null>(null);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  // Profile form
  const [name,           setName]           = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [profileSaving,  setProfileSaving]  = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError,   setProfileError]   = useState<string | null>(null);

  // Password form
  const [currentPw,   setCurrentPw]   = useState("");
  const [newPw,       setNewPw]       = useState("");
  const [confirmPw,   setConfirmPw]   = useState("");
  const [pwSaving,    setPwSaving]    = useState(false);
  const [pwSuccess,   setPwSuccess]   = useState<string | null>(null);
  const [pwError,     setPwError]     = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load profile");
        return res.json() as Promise<FullProfile>;
      })
      .then((data) => {
        setProfile(data);
        setName(data.name);
        setGithubUsername(data.githubUsername ?? "");
      })
      .catch(() => setFetchErr("Could not load your profile. Please try again."));
  }, [token]);

  async function handleProfileSave(e: FormEvent) {
    e.preventDefault();
    setProfileSuccess(null);
    setProfileError(null);
    setProfileSaving(true);
    try {
      const res = await fetch("/api/users/me", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          name:           name.trim() || undefined,
          githubUsername: githubUsername.trim() || null,
        }),
      });
      const data = await res.json() as { error?: string; name?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setProfileSuccess("Profile updated.");
      setProfile((p) => p ? { ...p, name: data.name!, githubUsername: (data as FullProfile).githubUsername } : p);
      await refreshUser();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordSave(e: FormEvent) {
    e.preventDefault();
    setPwSuccess(null);
    setPwError(null);

    if (newPw !== confirmPw) {
      setPwError("New passwords do not match");
      return;
    }
    if (newPw.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }

    setPwSaving(true);
    try {
      const res = await fetch("/api/users/me/password", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Password update failed");
      setPwSuccess("Password updated successfully.");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Password update failed");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      <main className="flex-1 max-w-2xl w-full mx-auto px-6 sm:px-8 py-10 space-y-6">

        {/* Page heading */}
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Profile &amp; Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your account details and password.</p>
        </div>

        {fetchErr && <ErrorBanner msg={fetchErr} />}

        {/* ── Account info ─────────────────────────────────────────────────── */}
        {profile && (
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-4 pb-5 mb-5 border-b border-slate-100">
              {/* Initials avatar */}
              <div className="w-12 h-12 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0 text-indigo-600 font-bold text-base select-none">
                {profile.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 truncate">{profile.name}</p>
                <p className="text-xs text-slate-500 truncate">{profile.email}</p>
              </div>
              <span className={`ml-auto shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${ROLE_BADGE[profile.systemRole] ?? ROLE_BADGE.STUDENT}`}>
                {ROLE_LABEL[profile.systemRole] ?? profile.systemRole}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-400">
              <span>Role</span>
              <span>Member since</span>
              <span className="text-slate-600 font-medium">{ROLE_LABEL[profile.systemRole]}</span>
              <span className="text-slate-600 font-medium">
                {new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
            </div>
          </div>
        )}

        {/* ── Profile form ─────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-5">Profile</h2>

          <form onSubmit={handleProfileSave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setProfileSuccess(null); }}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Email address</label>
              <div className="relative">
                <div className={readonlyClass}>{profile?.email ?? "—"}</div>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Email cannot be changed.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Role</label>
              <div className="relative">
                <div className={readonlyClass}>{profile ? (ROLE_LABEL[profile.systemRole] ?? profile.systemRole) : "—"}</div>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Role is assigned by an administrator.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                GitHub username
               
              </label>
              <input
                type="text"
                value={githubUsername}
                onChange={(e) => { setGithubUsername(e.target.value); setProfileSuccess(null); }}
                placeholder="your-github-handle"
                className={inputClass}
              />
              <p className="text-[11px] text-slate-400 mt-1">Used to match your commits in contribution reports.</p>
            </div>

            {profileSuccess && <SuccessBanner msg={profileSuccess} />}
            {profileError   && <ErrorBanner  msg={profileError}   />}

            <div className="pt-1">
              <button
                type="submit"
                disabled={profileSaving || !profile}
                className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {profileSaving ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>
        </div>

        {/* ── Change password ──────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-5">Change Password</h2>

          <form onSubmit={handlePasswordSave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Current password</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => { setCurrentPw(e.target.value); setPwSuccess(null); }}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">New password</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => { setNewPw(e.target.value); setPwSuccess(null); }}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirm new password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => { setConfirmPw(e.target.value); setPwSuccess(null); }}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            {pwSuccess && <SuccessBanner msg={pwSuccess} />}
            {pwError   && <ErrorBanner  msg={pwError}   />}

            <div className="pt-1">
              <button
                type="submit"
                disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pwSaving ? "Updating…" : "Update password"}
              </button>
            </div>
          </form>
        </div>

        {/* ── Danger zone ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-1">
          <button
            onClick={() => navigate(roleHome(user?.systemRole))}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            ← Back to dashboard
          </button>
          <p className="text-[11px] text-slate-400">
            Role and email are managed by your institution.
          </p>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="px-6 sm:px-8 py-3 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-400">
            Outputs support instructor judgment — they do not constitute grades or final assessments.
          </p>
          <button
            onClick={() => navigate("/overview")}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            System Overview →
          </button>
        </div>
      </footer>
    </div>
  );
}
