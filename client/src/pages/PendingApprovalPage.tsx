import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD } from "../components/ui";

/**
 * Shown instead of the app to an instructor whose account is not approved. Approval is read from
 * the server on every instructor request, so "Check status" is all it takes to continue.
 */
export function PendingApprovalPage() {
  const { user, refreshUser, logout } = useAuth();
  const { navigate } = useRouter();
  const [checking, setChecking] = useState(false);
  const rejected = user?.instructorStatus === "REJECTED";

  async function check() {
    setChecking(true);
    try {
      const fresh = await refreshUser();
      if (fresh?.instructorStatus === "APPROVED") navigate("/dashboard");
    } finally {
      setChecking(false);
    }
  }

  // Re-check when the person returns to this tab, so approval is picked up without a manual step.
  useEffect(() => {
    function onFocus() {
      void refreshUser().then((fresh) => {
        if (fresh?.instructorStatus === "APPROVED") navigate("/dashboard");
      });
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUser, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8" style={{ background: "var(--brand-bg-light)" }}>
      <div className={`${CARD} w-full max-w-md p-6 text-center`}>
        <h1 className="text-xl font-semibold leading-tight text-slate-900">
          {rejected ? "Instructor request not approved" : "Waiting for approval"}
        </h1>
        <p className="mt-3 text-sm leading-normal text-slate-800" role="status">
          {rejected
            ? "Your instructor request was not approved. Contact your administrator."
            : "Your account is waiting for admin approval. You will be able to use instructor features as soon as an administrator approves it."}
        </p>
        {user && <p className="mt-2 break-all text-sm text-slate-700">Signed in as {user.email}</p>}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => void check()} disabled={checking} className={BUTTON_PRIMARY}>
            {checking ? "Checking…" : "Check status"}
          </button>
          <button type="button" onClick={() => { logout(); navigate("/login"); }} className={BUTTON_SECONDARY}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
