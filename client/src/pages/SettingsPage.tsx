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

// ── Edit Profile modal ────────────────────────────────────────────────────────
function EditProfileModal({
  profile,
  token,
  onClose,
  onSaved,
}: {
  profile: FullProfile;
  token: string | null;
  onClose: () => void;
  onSaved: (updated: Partial<FullProfile>) => void;
}) {
  const isStudent = profile.systemRole === "STUDENT";
  const [name, setName]                   = useState(profile.name);
  const [githubUsername, setGithubUsername] = useState(profile.githubUsername ?? "");
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string | null | undefined> = {
        name: name.trim() || undefined,
      };
      if (isStudent) body.githubUsername = githubUsername.trim() || null;
      const res  = await fetch("/api/users/me", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });
      const data = await res.json() as { error?: string; name?: string; githubUsername?: string | null };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      onSaved({ name: data.name, githubUsername: data.githubUsername ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Edit Profile</h2>
            <p className="text-xs text-slate-400 mt-0.5">Update your display name{isStudent ? " and GitHub username" : ""}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded" aria-label="Close">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="px-6 py-5 space-y-4">
            {error && <ErrorBanner msg={error} />}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                className={inputClass}
              />
            </div>

            {isStudent && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">GitHub username</label>
                <input
                  type="text"
                  value={githubUsername}
                  onChange={(e) => setGithubUsername(e.target.value)}
                  placeholder="your-github-handle"
                  className={inputClass}
                />
                <p className="text-[11px] text-slate-400 mt-1">Used to match your commits in contribution reports.</p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors font-medium disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Change Password modal ─────────────────────────────────────────────────────
function ChangePasswordModal({
  token,
  onClose,
}: {
  token: string | null;
  onClose: (success?: boolean) => void;
}) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPw !== confirmPw) { setError("New passwords do not match"); return; }
    if (newPw.length < 8)   { setError("New password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      const res  = await fetch("/api/users/me/password", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Password update failed");
      onClose(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Change Password</h2>
            <p className="text-xs text-slate-400 mt-0.5">Enter your current password to set a new one</p>
          </div>
          <button onClick={() => onClose()} className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded" aria-label="Close">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="px-6 py-5 space-y-4">
            {error && <ErrorBanner msg={error} />}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Current password</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                required
                autoFocus
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
                onChange={(e) => setNewPw(e.target.value)}
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
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className={inputClass}
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
            <button type="button" onClick={() => onClose()} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors font-medium disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !currentPw || !newPw || !confirmPw}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {saving ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { user, token, refreshUser } = useAuth();
  const { navigate } = useRouter();

  const [profile, setProfile]     = useState<FullProfile | null>(null);
  const [fetchErr, setFetchErr]   = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPwModal,   setShowPwModal]   = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [pwSuccess,      setPwSuccess]      = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load profile");
        return res.json() as Promise<FullProfile>;
      })
      .then((data) => setProfile(data))
      .catch(() => setFetchErr("Could not load your profile. Please try again."));
  }, [token]);

  async function handleProfileSaved(updated: Partial<FullProfile>) {
    setProfile((p) => p ? { ...p, ...updated } : p);
    setShowEditModal(false);
    setProfileSuccess("Profile updated.");
    await refreshUser();
    setTimeout(() => setProfileSuccess(null), 4000);
  }

  function handlePwModalClose(success?: boolean) {
    setShowPwModal(false);
    if (success) {
      setPwSuccess("Password updated successfully.");
      setTimeout(() => setPwSuccess(null), 4000);
    }
  }

  const isStudent = profile?.systemRole === "STUDENT";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      {showEditModal && profile && (
        <EditProfileModal
          profile={profile}
          token={token}
          onClose={() => setShowEditModal(false)}
          onSaved={(u) => void handleProfileSaved(u)}
        />
      )}

      {showPwModal && (
        <ChangePasswordModal
          token={token}
          onClose={handlePwModalClose}
        />
      )}

      <main className="flex-1 max-w-2xl w-full mx-auto px-6 sm:px-8 py-10 space-y-5">

        {/* Page heading */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Profile &amp; Settings</h1>
            <p className="text-sm text-slate-500 mt-0.5">Manage your account details and password.</p>
          </div>
          <button
            onClick={() => navigate(roleHome(user?.systemRole))}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </button>
        </div>

        {fetchErr && <ErrorBanner msg={fetchErr} />}

        {/* ── Account info ────────────────────────────────────────────────── */}
        {profile && (
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-4 pb-5 mb-5 border-b border-slate-100">
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

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-xs">
              <div>
                <p className="text-slate-400 mb-0.5">Email</p>
                <p className="text-slate-700 font-medium truncate">{profile.email}</p>
              </div>
              <div>
                <p className="text-slate-400 mb-0.5">Role</p>
                <p className="text-slate-700 font-medium">{ROLE_LABEL[profile.systemRole]}</p>
              </div>
              <div>
                <p className="text-slate-400 mb-0.5">Member since</p>
                <p className="text-slate-700 font-medium">
                  {new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </p>
              </div>
              {isStudent && (
                <div>
                  <p className="text-slate-400 mb-0.5">GitHub username</p>
                  <p className="text-slate-700 font-medium font-mono">
                    {profile.githubUsername ? `@${profile.githubUsername}` : <span className="text-slate-300 font-sans">Not set</span>}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Profile section ──────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Profile</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isStudent ? "Your display name and GitHub username." : "Your display name shown across the platform."}
              </p>
            </div>
            <button
              onClick={() => { setShowEditModal(true); setProfileSuccess(null); }}
              disabled={!profile}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-indigo-700 hover:border-indigo-300 text-xs font-semibold transition-colors disabled:opacity-40"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit
            </button>
          </div>

          {profileSuccess && (
            <div className="mt-4">
              <SuccessBanner msg={profileSuccess} />
            </div>
          )}

          {profile && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-slate-400 mb-1">Full name</p>
                <div className={readonlyClass}>{profile.name}</div>
              </div>
              {isStudent && (
                <div>
                  <p className="text-[11px] text-slate-400 mb-1">GitHub username</p>
                  <div className={`${readonlyClass} font-mono`}>
                    {profile.githubUsername || <span className="text-slate-300 font-sans">Not set</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Password section ─────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Password</h2>
              <p className="text-xs text-slate-400 mt-0.5">Change your login password.</p>
            </div>
            <button
              onClick={() => { setShowPwModal(true); setPwSuccess(null); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-indigo-700 hover:border-indigo-300 text-xs font-semibold transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Change password
            </button>
          </div>
          {pwSuccess && (
            <div className="mt-4">
              <SuccessBanner msg={pwSuccess} />
            </div>
          )}
        </div>

        {/* ── Read-only note ────────────────────────────────────────────────── */}
        <p className="text-[11px] text-slate-400 px-1">
          Email and role are managed by your institution and cannot be changed here.
        </p>

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
